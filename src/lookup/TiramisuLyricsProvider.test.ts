import { describe, expect, it, vi } from 'vitest'
import type { LyricDocument, LyricsProvider, TrackSummary } from '../domain'
import {
  TIRAMISU_DEFAULT_TRACKS,
  TiramisuLyricsProvider,
} from './TiramisuLyricsProvider'

function stubProvider(overrides: Partial<LyricsProvider> = {}): LyricsProvider {
  return {
    search: vi.fn(async () => []),
    getLyrics: vi.fn(async () => inventedDocument('lrclib:1')),
    ...overrides,
  }
}

function inventedDocument(id: string): LyricDocument {
  return {
    track: {
      id,
      title: 'Invented Track',
      artist: 'Invented Artist',
      collection: 'Invented Collection',
      source: id.startsWith('lrcmux:') ? 'lrcmux' : 'lrclib',
    },
    lines: [{ id: '1', text: 'Invented lyric line' }],
  }
}

describe('TiramisuLyricsProvider', () => {
  it('returns the three curated tracks without a network request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const primary = stubProvider()
    const provider = new TiramisuLyricsProvider({ primary, fallback: stubProvider(), fetch })

    await expect(provider.search('')).resolves.toEqual(TIRAMISU_DEFAULT_TRACKS)
    expect(TIRAMISU_DEFAULT_TRACKS.map(({ title, artist }) => ({ title, artist }))).toEqual([
      { title: 'This Modern Love', artist: 'Bloc Party' },
      { title: 'Melancholy', artist: 'Driveways' },
      { title: 'cbd', artist: 'brakence' },
    ])
    expect(primary.search).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses LRCLIB results without calling the metadata fallback', async () => {
    const result: TrackSummary = {
      id: 'lrclib:9',
      title: 'Invented Track',
      artist: 'Invented Artist',
      collection: 'Invented Collection',
      source: 'lrclib',
    }
    const primary = stubProvider({ search: vi.fn(async () => [result]) })
    const fetch = vi.fn<typeof globalThis.fetch>()
    const provider = new TiramisuLyricsProvider({ primary, fallback: stubProvider(), fetch })

    await expect(provider.search('invented')).resolves.toEqual([result])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('promotes the artist match when a title-and-artist query is poorly ordered upstream', async () => {
    const upstreamResults: TrackSummary[] = [
      {
        id: 'lrclib:1',
        title: 'Fear Not',
        artist: 'Another Artist',
        collection: 'Elsewhere',
        source: 'lrclib',
      },
      {
        id: 'lrclib:2',
        title: 'Far',
        artist: 'SZA',
        collection: 'SOS',
        source: 'lrclib',
      },
    ]
    const primary = stubProvider({
      search: vi.fn(async () => upstreamResults),
    })
    const provider = new TiramisuLyricsProvider({ primary, fallback: stubProvider(), fetch: vi.fn() })

    const results = await provider.search('fear sza')

    expect(results.map(({ id }) => id)).toEqual(['lrclib:2', 'lrclib:1'])
  })

  it('uses the selected search field for retrieval and ranking', async () => {
    const upstreamResults: TrackSummary[] = [
      {
        id: 'lrclib:1',
        title: 'Fear Not',
        artist: 'Another Artist',
        collection: 'Elsewhere',
        source: 'lrclib',
      },
      {
        id: 'lrclib:2',
        title: 'Far',
        artist: 'SZA',
        collection: 'SOS',
        source: 'lrclib',
      },
    ]
    const primary = stubProvider({ search: vi.fn(async () => upstreamResults) })
    const provider = new TiramisuLyricsProvider({ primary, fallback: stubProvider(), fetch: vi.fn() })

    const titleResults = await provider.search('fear sza', undefined, 'title')
    const artistResults = await provider.search('fear sza', undefined, 'artist')

    expect(titleResults[0]).toMatchObject({ id: 'lrclib:1' })
    expect(artistResults[0]).toMatchObject({ id: 'lrclib:2' })
    expect(primary.search).toHaveBeenNthCalledWith(1, 'fear sza', undefined, 'title')
    expect(primary.search).toHaveBeenNthCalledWith(2, 'fear sza', undefined, 'artist')
  })

  it('turns metadata suggestions into stable fallback results when LRCLIB is empty', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn(async () => ({
        data: [
          {
            title: 'Invented Track',
            artist: { name: 'Invented Artist' },
            album: { title: 'Invented Collection' },
            duration: 210,
          },
          {
            title: 'Invented Track',
            artist: { name: 'Invented Artist' },
            album: { title: 'Duplicate Collection' },
            duration: 211,
          },
        ],
      })),
    } as unknown as Response)
    const provider = new TiramisuLyricsProvider({
      primary: stubProvider(),
      fallback: stubProvider(),
      fetch,
      suggestUrl: 'https://example.test/suggest/',
    })

    const results = await provider.search('invented song')

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://example.test/suggest/invented%20song' }),
      expect.objectContaining({ signal: undefined }),
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: expect.stringMatching(/^lrcmux:/),
      title: 'Invented Track',
      artist: 'Invented Artist',
      source: 'lrcmux',
    })
  })

  it('routes namespaced IDs to the matching lyrics adapter', async () => {
    const primary = stubProvider({
      getLyrics: vi.fn(async (id) => inventedDocument(id)),
    })
    const fallback = stubProvider({
      getLyrics: vi.fn(async (id) => inventedDocument(id)),
    })
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })

    await provider.getLyrics('lrclib:42')
    await provider.getLyrics('lrcmux:encoded')

    expect(primary.getLyrics).toHaveBeenCalledWith('lrclib:42', undefined)
    expect(fallback.getLyrics).toHaveBeenCalledWith('lrcmux:encoded', undefined)
    await expect(provider.getLyrics('unknown:1')).rejects.toThrow('Unknown lyrics source')
  })
})
