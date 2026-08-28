import { describe, expect, it } from 'vitest'

import {
  FIXTURE_FAILURE_TRIGGER,
  FixtureLyricsProvider,
} from './FixtureLyricsProvider'

describe('FixtureLyricsProvider', () => {
  const provider = new FixtureLyricsProvider({ latencyMs: 0 })

  it('finds preview tracks by normalized metadata', async () => {
    await expect(provider.search('  BLOC PARTY  ')).resolves.toEqual([
      expect.objectContaining({
        id: 'this-modern-love',
        title: 'This Modern Love',
        artist: 'Bloc Party',
        source: 'fixture',
      }),
    ])

    await expect(provider.search('CBD')).resolves.toEqual([
      expect.objectContaining({
        id: 'cbd',
        title: 'cbd',
        artist: 'brakence',
      }),
    ])
  })

  it('returns the default preview order and no results for a miss', async () => {
    await expect(provider.search('')).resolves.toEqual([
      expect.objectContaining({
        id: 'this-modern-love',
        title: 'This Modern Love',
        artist: 'Bloc Party',
      }),
      expect.objectContaining({
        id: 'melancholy',
        title: 'Melancholy',
        artist: 'Driveways',
      }),
      expect.objectContaining({
        id: 'cbd',
        title: 'cbd',
        artist: 'brakence',
      }),
    ])
    await expect(provider.search('a song that is not here')).resolves.toEqual([])
  })

  it('returns a complete lyric document by ID', async () => {
    const document = await provider.getLyrics('melancholy')

    expect(document.track).toMatchObject({
      artist: 'Driveways',
      title: 'Melancholy',
    })
    expect(document.source).toBe('fixture')
    expect(document.lines[0]).toMatchObject({
      text: '[Licensed lyrics are not loaded in this preview.]',
    })
  })

  it('rejects unknown IDs and the intentional UI failure trigger', async () => {
    await expect(provider.getLyrics('not-a-track')).rejects.toThrow('No fixture lyrics')
    await expect(provider.search(FIXTURE_FAILURE_TRIGGER)).rejects.toThrow(
      'intentionally failed',
    )
    await expect(provider.getLyrics(FIXTURE_FAILURE_TRIGGER)).rejects.toThrow(
      'intentionally failed',
    )
  })

  it('honors an abort signal while simulating a loading delay', async () => {
    const delayedProvider = new FixtureLyricsProvider({ latencyMs: 100 })
    const controller = new AbortController()
    const result = delayedProvider.search('modern', controller.signal)

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})
