import { describe, expect, it, vi } from 'vitest'
import type { LyricDocument, LyricsProvider, TrackSummary } from '../domain'
import {
  TIRAMISU_DEFAULT_TRACKS,
  TiramisuLyricsProvider,
} from './TiramisuLyricsProvider'
import { LrcLibRequestError } from './LrcLibLyricsProvider'
import { createLrcMuxTrackSummary, LrcMuxRequestError } from './LrcMuxLyricsProvider'

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
    expect(TIRAMISU_DEFAULT_TRACKS[0]).toMatchObject({ id: 'lrclib:9878071', source: 'lrclib' })
    expect(primary.search).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves useful LRCLIB results when metadata enrichment fails', async () => {
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
    expect(fetch).toHaveBeenCalledOnce()
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
    expect(primary.search).toHaveBeenNthCalledWith(1, 'fear sza', expect.any(AbortSignal), 'title')
    expect(primary.search).toHaveBeenNthCalledWith(2, 'fear sza', expect.any(AbortSignal), 'artist')
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
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(results).toHaveLength(2)
    expect(results.map(({ collection, durationSeconds }) => [collection, durationSeconds])).toEqual([
      ['Invented Collection', 210], ['Duplicate Collection', 211],
    ])
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

    expect(primary.getLyrics).toHaveBeenCalledWith('lrclib:42', expect.any(AbortSignal))
    expect(fallback.getLyrics).toHaveBeenCalledWith('lrcmux:encoded', expect.any(AbortSignal))
    await expect(provider.getLyrics('unknown:1')).rejects.toThrow('Unknown lyrics source')
  })

  it('recovers a stale LrcMux link through an exact LRCLIB match', async () => {
    const savedTrack = createLrcMuxTrackSummary({
      title: 'This Modern Love', artist: 'Bloc Party', album: 'Silent Alarm', duration: 266,
    })
    const primary = stubProvider({
      search: vi.fn(async () => [
        { id: 'lrclib:wrong', title: 'This Modern Love (Live)', artist: 'Bloc Party', collection: 'Live', source: 'lrclib' as const },
        { id: 'lrclib:9878071', title: 'This Modern Love', artist: 'Bloc Party', collection: 'Silent Alarm', durationSeconds: 266, source: 'lrclib' as const },
      ]),
      getLyrics: vi.fn(async (id) => ({...inventedDocument(id), track: {id, title: 'This Modern Love', artist: 'Bloc Party', collection: 'Silent Alarm', durationSeconds: 266, source: 'lrclib' as const}})),
    })
    const fallback = stubProvider({ getLyrics: vi.fn(async () => { throw new LrcMuxRequestError(404) }) })
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })

    await expect(provider.getLyrics(savedTrack.id)).resolves.toMatchObject({ track: { id: 'lrclib:9878071' } })
    expect(primary.search).toHaveBeenCalledWith('This Modern Love Bloc Party', expect.any(AbortSignal))
    expect(primary.getLyrics).toHaveBeenCalledWith('lrclib:9878071', expect.any(AbortSignal))
  })

  it('does not substitute a different song during missing-track or outage recovery', async () => {
    const savedTrack = createLrcMuxTrackSummary({ title: 'This Modern Love', artist: 'Bloc Party' })
    const primary = stubProvider({ search: vi.fn(async () => [
      { id: 'lrclib:other', title: 'This Modern Love (Live)', artist: 'Bloc Party', collection: 'Live', source: 'lrclib' as const },
    ]) })
    const fallback = stubProvider({ getLyrics: vi.fn(async () => { throw new LrcMuxRequestError(404) }) })
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })

    await expect(provider.getLyrics(savedTrack.id)).rejects.toMatchObject({ status: 404 })
    expect(primary.getLyrics).not.toHaveBeenCalled()

    const outage = new LrcMuxRequestError(503)
    fallback.getLyrics = vi.fn(async () => { throw outage })
    await expect(provider.getLyrics(savedTrack.id)).rejects.toBe(outage)
    expect(primary.search).toHaveBeenCalledTimes(2)
  })
})

it('keeps accented artist names together when ranking unaccented queries', async () => {
  const primary = stubProvider({ search: vi.fn(async () => [
    { id: 'lrclib:1', title: 'Bjork', artist: 'Other Artist', collection: 'Other', source: 'lrclib' as const },
    { id: 'lrclib:2', title: 'Joga', artist: 'Björk', collection: 'Homogenic', source: 'lrclib' as const },
  ]) })
  const provider = new TiramisuLyricsProvider({ primary, fetch: vi.fn() })
  expect((await provider.search('bjork')).map(({ id }) => id)).toEqual(['lrclib:2', 'lrclib:1'])
})

it('finds Alice by Cherry beyond twelve suggestions despite nonempty unrelated primary matches', async () => {
  const primary = stubProvider({ search: vi.fn(async () => [{
    id: 'lrclib:16065898', title: 'OKAGA, CA (feat. Alice Smith)',
    artist: 'Tyler, The Creator, Alice Smith', collection: 'Cherry Bomb', source: 'lrclib' as const,
  }]) })
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify({data: [
    ...Array.from({length: 12}, (_, index) => ({title: `Alice ${index}`, artist: {name: `Other Artist ${index}`}})),
    {id: 2924992271, title: 'Alice', artist: {name: 'Cherry'}, album: {title: 'Safe In Your Stare'}, duration: 241},
  ]})))
  const provider = new TiramisuLyricsProvider({primary, fetch})
  for (const query of ['Alice Cherry', 'Cherry Alice']) {
    const tracks = await provider.search(query)
    expect(tracks[0]).toMatchObject({title: 'Alice', artist: 'Cherry', collection: 'Safe In Your Stare', source: 'lrcmux'})
    expect(tracks.some(({id}) => id === 'lrclib:16065898')).toBe(true)
    expect(tracks).toHaveLength(12)
  }
})

it('uses metadata search when the primary catalog is unavailable', async () => {
  const primary = stubProvider({search: vi.fn(async () => {throw new Error('primary unavailable')})})
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({data: [
    {title: 'Alice', artist: {name: 'Cherry'}, album: {title: 'Safe In Your Stare'}, duration: 241},
  ]})))
  const provider = new TiramisuLyricsProvider({primary, fetch})
  expect((await provider.search('Alice Cherry'))[0]).toMatchObject({title: 'Alice', artist: 'Cherry'})
})

it('keeps the stable primary lyric ID when both catalogs identify the same recording', async () => {
  const primary = stubProvider({search: vi.fn(async () => [{
    id: 'lrclib:42', title: 'Alice', artist: 'Cherry', collection: 'Safe In Your Stare', durationSeconds: 241, source: 'lrclib' as const,
  }])})
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({data: [
    {title: 'Alice', artist: {name: 'Cherry'}, album: {title: 'Safe In Your Stare'}, duration: 241},
  ]})))
  const provider = new TiramisuLyricsProvider({primary, fetch})
  expect(await provider.search('Alice Cherry')).toEqual([expect.objectContaining({id: 'lrclib:42'})])
})

it('reports catalog failure rather than an empty match when both lookups fail', async () => {
  const provider = new TiramisuLyricsProvider({
    primary: stubProvider({search: vi.fn(async () => {throw new Error('primary unavailable')})}),
    fetch: vi.fn().mockRejectedValue(new Error('metadata unavailable')),
  })
  await expect(provider.search('Alice Cherry')).rejects.toThrow('primary unavailable')
})

it.each([
  [{id:'lrclib:1',title:'Alice (Live)',artist:'Cherry',collection:'Safe In Your Stare',durationSeconds:241,source:'lrclib' as const}],
  [{id:'lrclib:1',title:'Alice',artist:'Cherry',collection:'Another Album',durationSeconds:241,source:'lrclib' as const}],
  [{id:'lrclib:1',title:'Alice',artist:'Cherry',collection:'Safe In Your Stare',durationSeconds:260,source:'lrclib' as const}],
])('does not recover metadata links through a different version', async (candidate) => {
  const primary = stubProvider({search:vi.fn(async()=>[candidate])})
  const fallback = stubProvider({getLyrics:vi.fn(async()=>{throw new LrcMuxRequestError(404)})})
  const provider = new TiramisuLyricsProvider({primary,fallback,fetch:vi.fn()})
  const id = createLrcMuxTrackSummary({title:'Alice',artist:'Cherry',album:'Safe In Your Stare',duration:241}).id
  await expect(provider.getLyrics(id)).rejects.toMatchObject({status:404})
  expect(primary.getLyrics).not.toHaveBeenCalled()
})

it('rejects ambiguous identical candidates instead of picking the first', async () => {
  const candidates = [1,2].map(id=>({id:`lrclib:${id}`,title:'Alice',artist:'Cherry',collection:'Safe In Your Stare',durationSeconds:241,source:'lrclib' as const}))
  const primary = stubProvider({search:vi.fn(async()=>candidates)})
  const fallback = stubProvider({getLyrics:vi.fn(async()=>{throw new LrcMuxRequestError(404)})})
  const provider = new TiramisuLyricsProvider({primary,fallback,fetch:vi.fn()})
  const id = createLrcMuxTrackSummary({title:'Alice',artist:'Cherry',album:'Safe In Your Stare',duration:241}).id
  await expect(provider.getLyrics(id)).rejects.toMatchObject({name:'RecordingMismatchError'})
  expect(primary.getLyrics).not.toHaveBeenCalled()
})

it('keeps different albums in combined catalogs instead of treating them as the same recording', async () => {
  const primary = stubProvider({search:vi.fn(async()=>[{id:'lrclib:1',title:'Alice',artist:'Cherry',collection:'Other Album',durationSeconds:241,source:'lrclib' as const}])})
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{title:'Alice',artist:{name:'Cherry'},album:{title:'Safe In Your Stare'},duration:241}]})))
  const results=await new TiramisuLyricsProvider({primary,fetch}).search('Alice Cherry')
  expect(results).toHaveLength(2)
  expect(results.map(track=>track.collection)).toEqual(['Other Album','Safe In Your Stare'])
})

it('preserves distinct recordings within metadata suggestions and removes exact duplicates', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
    { title: 'Invented Track', artist: { name: 'Invented Artist' }, album: { title: 'First Album' }, duration: 241 },
    { title: 'Invented Track', artist: { name: 'Invented Artist' }, album: { title: 'Second Album' }, duration: 241 },
    { title: 'Invented Track', artist: { name: 'Invented Artist' }, album: { title: 'First Album' }, duration: 260 },
    { title: 'Invented Track', artist: { name: 'Invented Artist' }, album: { title: 'First Album' }, duration: 241 },
  ] })))
  const results = await new TiramisuLyricsProvider({ primary: stubProvider(), fetch }).search('Invented Track')
  expect(results.map(({ collection, durationSeconds }) => [collection, durationSeconds])).toEqual([
    ['First Album', 241], ['Second Album', 241], ['First Album', 260],
  ])
})


describe('independent provider recovery', () => {
  const track: TrackSummary = {
    id: 'lrclib:512', title: 'High Tops', artist: 'Del Water Gap',
    collection: '1 (646) 943 2672 (Extended Play)', durationSeconds: 238, source: 'lrclib',
  }
  const fallbackTrack = createLrcMuxTrackSummary({
    title: track.title, artist: track.artist, album: track.collection, duration: track.durationSeconds,
  })
  const document: LyricDocument = {
    track: fallbackTrack, lines: [{ id: '1', text: 'Original regression sample.' }],
    attribution: { name: 'Independent source', via: 'LrcMux' },
  }

  function stalledRequest(signal?: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }

  it('returns available metadata when primary search stalls', async () => {
    const primary = stubProvider({ search: vi.fn((_query, signal) => stalledRequest(signal)) })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      title: track.title, artist: { name: track.artist },
      album: { title: track.collection }, duration: track.durationSeconds,
    }] })))
    const provider = new TiramisuLyricsProvider({ primary, fetch, timeoutMs: 20 })
    await expect(provider.search('High Tops Del Water Gap')).resolves.toEqual([fallbackTrack])
  })

  it.each([new LrcLibRequestError(503), new TypeError('Failed to fetch'), new LrcLibRequestError(404)])(
    'recovers a selected LRCLIB recording after %s', async error => {
      const primary = stubProvider({
        search: vi.fn(async () => [track]), getLyrics: vi.fn(async () => { throw error }),
      })
      const fallback = stubProvider({ getLyrics: vi.fn(async () => document) })
      const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
      await provider.search(track.title)
      await expect(provider.getLyrics(track.id)).resolves.toEqual(document)
      expect(fallback.getLyrics).toHaveBeenCalledWith(fallbackTrack.id, expect.any(AbortSignal))
    },
  )

  it('gives the independent provider time after a stalled detail request', async () => {
    const primary = stubProvider({
      search: vi.fn(async () => [track]), getLyrics: vi.fn((_id, signal) => stalledRequest(signal)),
    })
    const fallback = stubProvider({ getLyrics: vi.fn(async () => document) })
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn(), timeoutMs: 20 })
    await provider.search(track.title)
    await expect(provider.getLyrics(track.id)).resolves.toEqual(document)
  })

  it('rejects a different recording returned by recovery', async () => {
    const primary = stubProvider({
      search: vi.fn(async () => [track]), getLyrics: vi.fn(async () => { throw new LrcLibRequestError(503) }),
    })
    const fallback = stubProvider({ getLyrics: vi.fn(async () => ({
      ...document, track: { ...fallbackTrack, title: 'High Tops (Stripped)', durationSeconds: 250 },
    })) })
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
    await provider.search(track.title)
    await expect(provider.getLyrics(track.id)).rejects.toMatchObject({ name: 'RecordingMismatchError' })
  })

  it('does not recover restricted requests or IDs without verified metadata', async () => {
    const primary = stubProvider({
      search: vi.fn(async () => [track]), getLyrics: vi.fn(async () => { throw new LrcLibRequestError(403) }),
    })
    const fallback = stubProvider()
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
    await provider.search(track.title)
    await expect(provider.getLyrics(track.id)).rejects.toMatchObject({ status: 403 })
    primary.getLyrics = vi.fn(async () => { throw new LrcLibRequestError(503) })
    await expect(provider.getLyrics('lrclib:unknown')).rejects.toMatchObject({ status: 503 })
    expect(fallback.getLyrics).not.toHaveBeenCalled()
  })

  it('does not start recovery after the reader cancels the request', async () => {
    const primary = stubProvider({
      search: vi.fn(async () => [track]), getLyrics: vi.fn((_id, signal) => stalledRequest(signal)),
    })
    const fallback = stubProvider()
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
    await provider.search(track.title)
    const controller = new AbortController()
    const request = provider.getLyrics(track.id, controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(fallback.getLyrics).not.toHaveBeenCalled()
  })
})


it('recovers an unavailable LrcMux source with the exact LRCLIB recording', async () => {
  const metadata = { title: 'Invented Track', artist: 'Invented Artist', album: 'Invented Collection', duration: 238 }
  const savedTrack = createLrcMuxTrackSummary(metadata)
  const document = { ...inventedDocument('lrclib:512'), track: { ...inventedDocument('lrclib:512').track, durationSeconds: 238 } }
  const primary = stubProvider({ search: vi.fn(async () => [document.track]), getLyrics: vi.fn(async () => document) })
  const fallback = stubProvider({ getLyrics: vi.fn(async () => { throw new TypeError('Failed to fetch') }) })
  const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
  await expect(provider.getLyrics(savedTrack.id)).resolves.toEqual(document)
})


it('keeps the original outage when the independent catalog has no match', async () => {
  const track = inventedDocument('lrclib:512').track
  const outage = new LrcLibRequestError(503)
  const primary = stubProvider({ search: vi.fn(async () => [track]), getLyrics: vi.fn(async () => { throw outage }) })
  const fallback = stubProvider({ getLyrics: vi.fn(async () => { throw new LrcMuxRequestError(404) }) })
  const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
  await provider.search(track.title)
  await expect(provider.getLyrics(track.id)).rejects.toBe(outage)
})

it('fits all three saved-link recovery deadlines inside the reader deadline', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  try {
    const document = inventedDocument('lrclib:512')
    const primary = stubProvider({ search: vi.fn(async () => [document.track]), getLyrics: vi.fn(async () => document) })
    const fallback = stubProvider({ getLyrics: vi.fn(async () => { throw new LrcMuxRequestError(503) }) })
    const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
    const track = createLrcMuxTrackSummary({ title: document.track.title, artist: document.track.artist })
    await expect(provider.getLyrics(track.id)).resolves.toEqual(document)
    expect(timeout).toHaveBeenCalledTimes(3)
    expect(timeout.mock.calls.reduce((total, [duration]) => total + duration, 0)).toBeLessThan(20_000)
  } finally { timeout.mockRestore() }
})


it('keeps the LrcMux outage when LRCLIB details disappear during recovery', async () => {
  const track = inventedDocument('lrclib:512').track
  const outage = new LrcMuxRequestError(503)
  const primary = stubProvider({ search: vi.fn(async () => [track]), getLyrics: vi.fn(async () => { throw new LrcLibRequestError(404) }) })
  const fallback = stubProvider({ getLyrics: vi.fn(async () => { throw outage }) })
  const provider = new TiramisuLyricsProvider({ primary, fallback, fetch: vi.fn() })
  const savedTrack = createLrcMuxTrackSummary({ title: track.title, artist: track.artist })
  await expect(provider.getLyrics(savedTrack.id)).rejects.toBe(outage)
})
