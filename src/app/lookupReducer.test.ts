import { describe, expect, it } from 'vitest'

import type { LyricDocument, TrackSummary } from '../domain'
import { initialLookupState, lookupReducer } from './lookupReducer'

const track: TrackSummary = {
  id: 'vellum-window',
  title: 'Vellum Window',
  artist: 'Cedar North',
  collection: 'Rooms for Keeping',
  source: 'fixture',
}

const document: LyricDocument = {
  track,
  source: 'fixture',
  lines: [{ id: '1', text: 'The window holds the afternoon like tea.' }],
}

describe('lookupReducer', () => {
  it('records a successful search lifecycle', () => {
    const loading = lookupReducer(initialLookupState, {
      type: 'searchStarted',
      requestId: 1,
    })
    const ready = lookupReducer(loading, {
      type: 'searchSucceeded',
      requestId: 1,
      results: [track],
    })

    expect(ready).toMatchObject({
      searchStatus: 'ready',
      results: [track],
      searchError: null,
    })
  })

  it('ignores stale search and lyric results', () => {
    const searching = lookupReducer(initialLookupState, {
      type: 'searchStarted',
      requestId: 2,
    })
    const afterStaleSearch = lookupReducer(searching, {
      type: 'searchSucceeded',
      requestId: 1,
      results: [track],
    })
    const loadingLyrics = lookupReducer(afterStaleSearch, {
      type: 'lyricsStarted',
      requestId: 2,
      id: track.id,
    })
    const afterStaleLyrics = lookupReducer(loadingLyrics, {
      type: 'lyricsSucceeded',
      requestId: 1,
      document,
    })

    expect(afterStaleSearch).toBe(searching)
    expect(afterStaleLyrics).toBe(loadingLyrics)
  })

  it('clears the previous lyric sheet while a selected track is loading', () => {
    const withDocument = {
      ...initialLookupState,
      document,
      lyricsStatus: 'ready' as const,
      selectedTrackId: track.id,
    }

    const next = lookupReducer(withDocument, {
      type: 'lyricsStarted',
      requestId: 3,
      id: 'gallery-after-rain',
    })

    expect(next).toMatchObject({
      selectedTrackId: 'gallery-after-rain',
      document: null,
      lyricsStatus: 'loading',
      lyricsError: null,
    })
  })

  it('captures failures and resets the lookup state', () => {
    const failed = lookupReducer(
      lookupReducer(initialLookupState, { type: 'searchStarted', requestId: 1 }),
      { type: 'searchFailed', requestId: 1, error: 'The shelf is closed.' },
    )

    expect(failed).toMatchObject({
      searchStatus: 'error',
      searchError: 'The shelf is closed.',
    })
    expect(lookupReducer(failed, { type: 'reset' })).toEqual(initialLookupState)
  })
})
