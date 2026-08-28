import { describe, expect, it, vi } from 'vitest'

import {
  createLrcMuxTrackSummary,
  decodeLrcMuxTrackMetadata,
  decodeLrcMuxTrackSummary,
  LrcMuxLyricsProvider,
  LrcMuxLyricsUnavailableError,
  LrcMuxPayloadError,
  LrcMuxRequestError,
} from './LrcMuxLyricsProvider'

function response(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Nope',
    headers: new Headers(headers),
    json: vi.fn(async () => payload),
  } as unknown as Response
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    track: {
      title: 'Invented Track',
      artist: 'Invented Artist',
    },
    meta: {
      source: {
        id: 'invented-source',
        name: 'Invented Source',
        url: 'https://example.test/invented-source',
      },
      level: 'none',
    },
    lines: [{ text: 'Invented first line' }],
    ...overrides,
  }
}

describe('LrcMuxLyricsProvider', () => {
  it('creates stable self-contained summaries and decodes their metadata', () => {
    const summary = createLrcMuxTrackSummary({
      artist: 'Invented Artist',
      title: 'Invented Track',
      album: 'Invented Collection',
      duration: 203.5,
    })

    expect(summary).toEqual({
      id: expect.stringMatching(/^lrcmux:[A-Za-z0-9_-]+$/),
      title: 'Invented Track',
      artist: 'Invented Artist',
      collection: 'Invented Collection',
      source: 'lrcmux',
    })
    expect(decodeLrcMuxTrackMetadata(summary.id)).toEqual({
      artist: 'Invented Artist',
      title: 'Invented Track',
      album: 'Invented Collection',
      duration: 203.5,
    })
    expect(decodeLrcMuxTrackSummary(summary.id)).toEqual(summary)
  })

  it('requests a document using only the metadata stored in the namespaced ID', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(payload({
        lines: [
          { text: '\uFEFF  Invented first line  ' },
          { text: '  ' },
          { text: 'Invented second line' },
        ],
      })),
    )
    const provider = new LrcMuxLyricsProvider({ fetch })
    const summary = createLrcMuxTrackSummary({
      artist: 'Invented Artist',
      title: 'Invented Track',
      album: 'Invented Collection',
      duration: 203.5,
    })

    await expect(provider.getLyrics(summary.id)).resolves.toEqual({
      track: summary,
      lines: [
        { id: '1', text: 'Invented first line' },
        { id: '2', text: 'Invented second line' },
      ],
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.lrcmux.dev/get?artist=Invented+Artist&title=Invented+Track&album=Invented+Collection&duration=203.5&format=json&level=none',
      }),
      expect.objectContaining({ method: 'GET', signal: undefined }),
    )
  })

  it('does not perform catalog search, leaving candidate selection to a composite provider', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const provider = new LrcMuxLyricsProvider({ fetch })

    await expect(provider.search('invented')).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports empty and explicitly instrumental results as unavailable', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(payload({ lines: [] })))
      .mockResolvedValueOnce(response(payload({ track: { title: 'Invented Track', artist: 'Invented Artist', instrumental: true } })))
    const provider = new LrcMuxLyricsProvider({ fetch })
    const id = createLrcMuxTrackSummary({ artist: 'Invented Artist', title: 'Invented Track' }).id

    await expect(provider.getLyrics(id)).rejects.toMatchObject({
      name: 'LrcMuxLyricsUnavailableError',
      message: expect.stringContaining('no readable lyric lines'),
    } satisfies Partial<LrcMuxLyricsUnavailableError>)
    await expect(provider.getLyrics(id)).rejects.toThrow('instrumental')
  })

  it('rejects malformed IDs and malformed API payloads', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(payload({ lines: [{ text: 42 }] })))
    const provider = new LrcMuxLyricsProvider({ fetch })
    const id = createLrcMuxTrackSummary({ artist: 'Invented Artist', title: 'Invented Track' }).id

    expect(() => decodeLrcMuxTrackMetadata('not-lrcmux')).toThrow(LrcMuxPayloadError)
    await expect(provider.getLyrics(id)).rejects.toThrow('lines[0].text')
  })

  it('surfaces non-2xx errors and preserves Retry-After for rate limits', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ error: 'gone' }, 410))
      .mockResolvedValueOnce(response({ error: 'slow down' }, 429, { 'Retry-After': '12' }))
    const provider = new LrcMuxLyricsProvider({ fetch })
    const id = createLrcMuxTrackSummary({ artist: 'Invented Artist', title: 'Invented Track' }).id

    await expect(provider.getLyrics(id)).rejects.toMatchObject({
      name: 'LrcMuxRequestError',
      status: 410,
      retryAfter: null,
    } satisfies Partial<LrcMuxRequestError>)
    await expect(provider.getLyrics(id)).rejects.toMatchObject({
      name: 'LrcMuxRequestError',
      status: 429,
      retryAfter: '12',
    } satisfies Partial<LrcMuxRequestError>)
  })

  it('honors an already-aborted signal and an abort during fetch', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn<typeof globalThis.fetch>()
    const provider = new LrcMuxLyricsProvider({ fetch })
    const id = createLrcMuxTrackSummary({ artist: 'Invented Artist', title: 'Invented Track' }).id

    await expect(provider.getLyrics(id, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()

    const inFlight = new AbortController()
    const delayedFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      inFlight.abort()
      return response(payload())
    })
    const delayedProvider = new LrcMuxLyricsProvider({ fetch: delayedFetch })
    await expect(delayedProvider.getLyrics(id, inFlight.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
