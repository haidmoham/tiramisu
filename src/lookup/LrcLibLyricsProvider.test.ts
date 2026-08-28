import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LRCLIB_RESULT_COUNT,
  LrcLibLyricsProvider,
  LrcLibLyricsUnavailableError,
  LrcLibPayloadError,
  LrcLibRequestError,
} from './LrcLibLyricsProvider'

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Nope',
    json: vi.fn(async () => payload),
  } as unknown as Response
}

function result(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    trackName: 'Invented Track',
    artistName: 'Invented Artist',
    albumName: 'Invented Collection',
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...overrides,
  }
}

describe('LrcLibLyricsProvider', () => {
  it('maps search results to stable summaries and bounds the result count', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response([result(101), result(102), result(103)]),
    )
    const provider = new LrcLibLyricsProvider({ fetch, maxResults: 2 })

    const tracks = await provider.search('  invented artist  ')

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lrclib.net/api/search?q=invented+artist',
      }),
      expect.objectContaining({ method: 'GET', signal: undefined }),
    )
    expect(tracks).toEqual([
      expect.objectContaining({
        id: 'lrclib:101',
        title: 'Invented Track',
        artist: 'Invented Artist',
        collection: 'Invented Collection',
        source: 'lrclib',
      }),
      expect.objectContaining({ id: 'lrclib:102' }),
    ])
    expect(tracks).toHaveLength(2)
  })

  it('uses the public default result bound when no count is supplied', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(Array.from({ length: DEFAULT_LRCLIB_RESULT_COUNT + 3 }, (_, index) => result(index))),
    )
    const provider = new LrcLibLyricsProvider({ fetch })

    await expect(provider.search('many')).resolves.toHaveLength(DEFAULT_LRCLIB_RESULT_COUNT)
  })

  it('normalizes plain lyric text into trimmed semantic lines', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(
        result(201, {
          plainLyrics: '\uFEFF  Invented first line  \r\n\r\nInvented second line\n',
        }),
      ),
    )
    const provider = new LrcLibLyricsProvider({ fetch })

    await expect(provider.getLyrics('lrclib:201')).resolves.toMatchObject({
      track: { id: 'lrclib:201', title: 'Invented Track' },
      lines: [
        { id: '1', text: 'Invented first line' },
        { id: '2', text: 'Invented second line' },
      ],
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://lrclib.net/api/get/201' }),
      expect.anything(),
    )
  })

  it('falls back to synced lyrics and strips timestamps and metadata tags', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(
        result(202, {
          syncedLyrics: '[ar:Invented Artist]\n[00:01.20]  Invented synced line\n[01:02.3][01:04.5]Another synced line',
        }),
      ),
    )
    const provider = new LrcLibLyricsProvider({ fetch })

    await expect(provider.getLyrics('lrclib:202')).resolves.toMatchObject({
      lines: [
        { id: '1', text: 'Invented synced line' },
        { id: '2', text: 'Another synced line' },
      ],
    })
  })

  it('reports instrumental and missing-lyrics results as unavailable', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(result(301, { instrumental: true })))
      .mockResolvedValueOnce(response(result(302)))
    const provider = new LrcLibLyricsProvider({ fetch })

    await expect(provider.getLyrics('lrclib:301')).rejects.toBeInstanceOf(LrcLibLyricsUnavailableError)
    await expect(provider.getLyrics('lrclib:302')).rejects.toThrow('returned no lyrics')
  })

  it('rejects non-2xx and malformed API responses', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ message: 'not found' }, 404))
      .mockResolvedValueOnce(response({ nope: true }))
      .mockResolvedValueOnce(response([result(401, { trackName: 42 })]))
    const provider = new LrcLibLyricsProvider({ fetch })

    await expect(provider.getLyrics('lrclib:404')).rejects.toMatchObject({
      name: 'LrcLibRequestError',
      status: 404,
    } satisfies Partial<LrcLibRequestError>)
    await expect(provider.search('malformed')).rejects.toBeInstanceOf(LrcLibPayloadError)
    await expect(provider.search('malformed item')).rejects.toThrow('trackName')
  })

  it('honors an already-aborted signal and an abort during fetch', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn<typeof globalThis.fetch>()
    const provider = new LrcLibLyricsProvider({ fetch })

    await expect(provider.search('cancelled', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetch).not.toHaveBeenCalled()

    const inFlight = new AbortController()
    const delayedFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      async () => {
        inFlight.abort()
        return response(result(501))
      },
    )
    const delayedProvider = new LrcLibLyricsProvider({ fetch: delayedFetch })
    await expect(delayedProvider.search('during', inFlight.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
