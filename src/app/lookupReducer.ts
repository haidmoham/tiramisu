import type { LyricDocument, TrackSummary } from '../domain'

export type LookupStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface LookupState {
  query: string
  results: readonly TrackSummary[]
  selectedTrackId: string | null
  document: LyricDocument | null
  searchStatus: LookupStatus
  lyricsStatus: LookupStatus
  searchError: string | null
  lyricsError: string | null
  searchRequestId: number
  lyricsRequestId: number
}

export const initialLookupState: LookupState = {
  query: '',
  results: [],
  selectedTrackId: null,
  document: null,
  searchStatus: 'idle',
  lyricsStatus: 'idle',
  searchError: null,
  lyricsError: null,
  searchRequestId: 0,
  lyricsRequestId: 0,
}

export type LookupAction =
  | { type: 'queryChanged'; query: string }
  | { type: 'searchStarted'; requestId: number }
  | { type: 'searchSucceeded'; requestId: number; results: readonly TrackSummary[] }
  | { type: 'searchFailed'; requestId: number; error: string }
  | { type: 'trackSelected'; id: string }
  | { type: 'lyricsStarted'; requestId: number; id: string }
  | { type: 'lyricsSucceeded'; requestId: number; document: LyricDocument }
  | { type: 'lyricsFailed'; requestId: number; error: string }
  | { type: 'reset' }

/** Keeps lookup UI transitions deterministic and ignores late async responses. */
export function lookupReducer(state: LookupState, action: LookupAction): LookupState {
  switch (action.type) {
    case 'queryChanged':
      return { ...state, query: action.query }
    case 'searchStarted':
      return {
        ...state,
        searchStatus: 'loading',
        searchError: null,
        searchRequestId: action.requestId,
      }
    case 'searchSucceeded':
      if (action.requestId !== state.searchRequestId) return state
      return { ...state, results: action.results, searchStatus: 'ready' }
    case 'searchFailed':
      if (action.requestId !== state.searchRequestId) return state
      return { ...state, searchStatus: 'error', searchError: action.error }
    case 'trackSelected':
      return {
        ...state,
        selectedTrackId: action.id,
        document: null,
        lyricsStatus: 'idle',
        lyricsError: null,
      }
    case 'lyricsStarted':
      return {
        ...state,
        selectedTrackId: action.id,
        document: null,
        lyricsStatus: 'loading',
        lyricsError: null,
        lyricsRequestId: action.requestId,
      }
    case 'lyricsSucceeded':
      if (action.requestId !== state.lyricsRequestId) return state
      return {
        ...state,
        selectedTrackId: action.document.track.id,
        document: action.document,
        lyricsStatus: 'ready',
      }
    case 'lyricsFailed':
      if (action.requestId !== state.lyricsRequestId) return state
      return { ...state, lyricsStatus: 'error', lyricsError: action.error }
    case 'reset':
      return initialLookupState
  }
}
