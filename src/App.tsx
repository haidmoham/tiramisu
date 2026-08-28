import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import type { LyricsProvider, LyricsSearchField, TrackSummary } from './domain'
import { initialLookupState, lookupReducer } from './app/lookupReducer'
import { TiramisuLyricsProvider } from './lookup'
import { CommentsPanel } from './comments/CommentsPanel'
import type { CommentsStatus, GeniusComment, GeniusCommentsResponse } from './comments/CommentsPanel'
import type { AmbientCanvasProps } from './presentation/AmbientCanvas'
import { FocusModeToggle } from './presentation/FocusModeToggle'
import { LyricReader } from './presentation/LyricReader'
import { ResultSymbolToy } from './presentation/ResultSymbolToy'
import './styles/presentation.css'
import './App.css'

const defaultProvider = new TiramisuLyricsProvider()
const AmbientCanvas = lazy(async () => {
  const module = await import('./presentation/AmbientCanvas')
  return { default: module.AmbientCanvas }
})

function AmbientLayer(props: AmbientCanvasProps) {
  return (
    <Suspense fallback={null}>
      <AmbientCanvas {...props} />
    </Suspense>
  )
}

export interface AppProps {
  provider?: LyricsProvider
}

function App({ provider = defaultProvider }: AppProps) {
  const [state, dispatch] = useReducer(lookupReducer, initialLookupState)
  const [searchField, setSearchField] = useState<LyricsSearchField>('smart')
  const searchRequestId = useRef(0)
  const searchController = useRef<AbortController | null>(null)

  const search = useCallback(async (query: string, field: LyricsSearchField = 'smart') => {
    searchController.current?.abort()
    const controller = new AbortController()
    const requestId = ++searchRequestId.current
    searchController.current = controller
    dispatch({ type: 'searchStarted', requestId })

    try {
      const results = await provider.search(query, controller.signal, field)
      dispatch({ type: 'searchSucceeded', requestId, results })
    } catch (error) {
      if (isAbortError(error)) return
      dispatch({ type: 'searchFailed', requestId, error: messageFrom(error) })
    }
  }, [provider])

  useEffect(() => {
    void search('')
    return () => searchController.current?.abort()
  }, [search])

  return (
    <Routes>
      <Route
        path="/"
        element={
          <SearchView
            query={state.query}
            status={state.searchStatus}
            results={state.results}
            error={state.searchError}
            searchField={searchField}
            onQueryChange={(query) => dispatch({ type: 'queryChanged', query })}
            onSearchFieldChange={setSearchField}
            onSearch={search}
          />
        }
      />
      <Route
        path="/lyrics/:trackId"
        element={<LyricsView provider={provider} state={state} dispatch={dispatch} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

interface SearchViewProps {
  query: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  results: readonly TrackSummary[]
  error: string | null
  searchField: LyricsSearchField
  onQueryChange: (query: string) => void
  onSearchFieldChange: (field: LyricsSearchField) => void
  onSearch: (query: string, field: LyricsSearchField) => Promise<void>
}

function SearchView({
  query,
  status,
  results,
  error,
  searchField,
  onQueryChange,
  onSearchFieldChange,
  onSearch,
}: SearchViewProps) {
  const navigate = useNavigate()
  const isLoading = status === 'loading'

  return (
    <main className="search-view">
      <AmbientLayer />
      <div className="search-view__frame">
        <header className="search-view__masthead">
          <h1 className="wordmark">
            <Link to="/" aria-label="tiramisu home">
              <span className="wordmark__dot" aria-hidden="true" />
              tiramisu
            </Link>
          </h1>
        </header>

        <section className="search-hero" aria-label="Lyric search">
          <form
            className="search-form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              void onSearch(query, searchField)
            }}
          >
            <label className="search-form__label" htmlFor="lyric-search">
              Search the lyric sheets
            </label>
            <fieldset className="search-form__modes">
              <legend>Search by</legend>
              {SEARCH_FIELDS.map(({ value, label, note }) => (
                <label className="search-form__mode" key={value} title={note}>
                  <input
                    type="radio"
                    name="search-field"
                    value={value}
                    checked={searchField === value}
                    onChange={() => onSearchFieldChange(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <div className="search-form__field">
              <input
                id="lyric-search"
                name="query"
                type="search"
                value={query}
                placeholder="Title, artist, or collection"
                autoComplete="off"
                enterKeyHint="search"
                onChange={(event) => onQueryChange(event.target.value)}
              />
              <button type="submit" disabled={isLoading}>
                <span>{isLoading ? 'Looking…' : 'Look up'}</span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        </section>

        <section
          className="result-shelf"
          aria-labelledby="result-heading"
          aria-busy={isLoading}
        >
          <div className="result-shelf__heading">
            <h2 id="result-heading">{query ? 'results' : 'lyrics'}</h2>
            <span>{status === 'ready' ? `${results.length} ${query ? 'matches' : ''}`.trim() : ''}</span>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {isLoading
              ? `Looking for ${query || 'lyrics'}.`
              : status === 'ready'
                ? `${results.length} ${query ? `matches for “${query}”` : 'lyric sheets'}. Select a result to open its lyric sheet.`
                : ''}
          </p>

          {status === 'error' ? (
            <div className="lookup-message" role="alert">
              <p>Couldn’t load lyrics.</p>
              <span>{error}</span>
            </div>
          ) : null}

          {status === 'ready' && results.length === 0 ? (
            <div className="lookup-message">
              <p>No lyric sheet matched “{query}”.</p>
              <button type="button" onClick={() => void onSearch('', searchField)}>Show all</button>
            </div>
          ) : null}

          <ol className="result-list" data-loading={isLoading}>
            {results.map((track, index) => (
              <li key={track.id}>
                <button
                  type="button"
                  className="result-card"
                  onClick={() => navigate(`/lyrics/${track.id}`)}
                >
                  <span className="result-card__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="result-card__identity">
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </span>
                  <span className="result-card__toy">
                    <ResultSymbolToy seed={`${track.id}-${index}`} />
                  </span>
                  <span className="result-card__arrow" aria-hidden="true">↗</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

      </div>
    </main>
  )
}

const SEARCH_FIELDS: readonly {
  value: LyricsSearchField
  label: string
  note: string
}[] = [
  { value: 'smart', label: 'Smart', note: 'Balances title and artist matches.' },
  { value: 'title', label: 'Title', note: 'Uses LRCLIB title retrieval and title-first ranking.' },
  { value: 'artist', label: 'Artist', note: 'Prioritizes artist matches in the catalog.' },
]

type AppState = ReturnType<typeof lookupReducer>
type AppDispatch = Dispatch<Parameters<typeof lookupReducer>[1]>

interface LyricsViewProps {
  provider: LyricsProvider
  state: AppState
  dispatch: AppDispatch
}

interface TrackCommentsState {
  trackId?: string
  mode: 'lyrics' | 'comments'
  status: CommentsStatus
  response: GeniusCommentsResponse | null
}

const initialTrackCommentsState: TrackCommentsState = {
  mode: 'lyrics',
  status: 'idle',
  response: null,
}

function LyricsView({ provider, state, dispatch }: LyricsViewProps) {
  const { trackId } = useParams()
  const navigate = useNavigate()
  const lyricsRequestId = useRef(0)
  const [focusMode, setFocusMode] = useState(false)
  const [activeLineId, setActiveLineId] = useState<string | undefined>()
  const [canvasAvailable, setCanvasAvailable] = useState(true)
  const [trackComments, setTrackComments] = useState<TrackCommentsState>(initialTrackCommentsState)
  const commentsController = useRef<AbortController | null>(null)
  const commentsRequestId = useRef(0)
  const lyricScrollPosition = useRef(0)

  useEffect(() => {
    if (!trackId) return undefined

    const controller = new AbortController()
    const requestId = ++lyricsRequestId.current
    dispatch({ type: 'lyricsStarted', requestId, id: trackId })

    void provider
      .getLyrics(trackId, controller.signal)
      .then((document) => dispatch({ type: 'lyricsSucceeded', requestId, document }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        dispatch({ type: 'lyricsFailed', requestId, error: messageFrom(error) })
      })

    return () => controller.abort()
  }, [dispatch, provider, trackId])

  useEffect(() => {
    commentsController.current?.abort()
    commentsController.current = null
    commentsRequestId.current += 1

    return () => commentsController.current?.abort()
  }, [trackId])

  const document = state.document?.track.id === trackId ? state.document : null

  if (state.selectedTrackId === trackId && state.lyricsStatus === 'error') {
    return (
      <main className="reader-state">
        <AmbientLayer />
        <p className="eyebrow">The page is missing</p>
        <h1>That lyric sheet could not be found.</h1>
        <p>{state.lyricsError}</p>
        <button type="button" onClick={() => navigate('/')}>
          Back to search
        </button>
      </main>
    )
  }

  if (!document) {
    return (
      <main className="reader-state" aria-busy="true">
        <AmbientLayer />
        <span className="reader-state__loader" aria-hidden="true" />
        <p>Opening the lyric sheet…</p>
      </main>
    )
  }

  const presentedActiveLineId = document.lines.some((line) => line.id === activeLineId)
    ? activeLineId
    : document.lines[0]?.id
  const comments = trackComments.trackId === trackId ? trackComments : initialTrackCommentsState

  const fetchComments = async (page: number) => {
    if (!trackId) return

    commentsController.current?.abort()
    const controller = new AbortController()
    const requestId = ++commentsRequestId.current
    commentsController.current = controller
    setTrackComments((previous) => ({
      trackId,
      mode: 'comments',
      status: 'loading',
      response: page === 1 ? null : previous.trackId === trackId ? previous.response : null,
    }))

    try {
      const params = new URLSearchParams({
        title: document.track.title,
        artist: document.track.artist,
        page: String(page),
      })
      const response = await fetch(`/api/genius-comments?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Comments request failed.')
      const payload = normalizeCommentsResponse(await response.json())

      if (controller.signal.aborted || commentsRequestId.current !== requestId) return
      setTrackComments((previous) => {
        const prior = previous.trackId === trackId ? previous.response : null
        return {
          trackId,
          mode: 'comments',
          status: 'ready',
          response: page === 1
            ? payload
            : {
                ...payload,
                comments: mergeComments(prior?.comments ?? [], payload.comments),
                songUrl: payload.songUrl ?? prior?.songUrl,
              },
        }
      })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      if (commentsRequestId.current !== requestId) return
      setTrackComments({ trackId, mode: 'comments', status: 'error', response: null })
    }
  }

  const showLyrics = () => {
    setTrackComments((previous) => ({ ...previous, trackId, mode: 'lyrics' }))
    requestAnimationFrame(() => window.scrollTo({ top: lyricScrollPosition.current, behavior: 'auto' }))
  }

  const showComments = () => {
    if (focusMode) return
    lyricScrollPosition.current = window.scrollY
    setTrackComments((previous) => ({ ...previous, trackId, mode: 'comments' }))
    window.scrollTo({ top: 0, behavior: 'auto' })
    if (comments.status === 'idle') void fetchComments(1)
  }

  const setFocus = (nextFocused: boolean) => {
    if (nextFocused && comments.mode === 'comments') showLyrics()
    setFocusMode(nextFocused)
  }

  return (
    <main className="reader-view" data-focus={focusMode} data-canvas={canvasAvailable}>
      {canvasAvailable ? <AmbientLayer onFallback={() => setCanvasAvailable(false)} /> : null}
      <nav className="reader-tools" aria-label="Reader controls">
        <button className="reader-tools__back" type="button" onClick={() => navigate('/')}>
          <span aria-hidden="true">←</span>
          <span>Search</span>
        </button>
        <div className="reader-tools__end">
          {!focusMode ? (
            <div className="reader-mode-toggle" role="tablist" aria-label="Reader view">
              <button
                id="reader-mode-lyrics"
                type="button"
                role="tab"
                aria-selected={comments.mode === 'lyrics'}
                aria-controls="reader-lyrics-panel"
                onClick={showLyrics}
              >
                Lyrics
              </button>
              <button
                id="reader-mode-comments"
                type="button"
                role="tab"
                aria-selected={comments.mode === 'comments'}
                aria-controls="reader-comments-panel"
                onClick={showComments}
              >
                Comments
              </button>
            </div>
          ) : null}
          <FocusModeToggle isFocused={focusMode} onToggle={setFocus} />
        </div>
      </nav>
      <section
        id="reader-lyrics-panel"
        role="tabpanel"
        aria-labelledby="reader-mode-lyrics"
        hidden={!focusMode && comments.mode !== 'lyrics'}
      >
        <LyricReader
          document={document}
          state={{ focusMode, activeLineId: presentedActiveLineId }}
          onActiveLineChange={setActiveLineId}
        />
      </section>
      {!focusMode ? (
        <CommentsPanel
          status={comments.status}
          response={comments.response}
          hidden={comments.mode !== 'comments'}
          onLoadMore={() => {
            if (comments.response?.nextPage) void fetchComments(comments.response.nextPage)
          }}
        />
      ) : null}
    </main>
  )
}

function normalizeCommentsResponse(value: unknown): GeniusCommentsResponse {
  if (!value || typeof value !== 'object') throw new Error('Invalid comments response.')
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.comments)) throw new Error('Invalid comments response.')

  return {
    songUrl: typeof record.songUrl === 'string' ? record.songUrl : undefined,
    commentsUnavailable: record.commentsUnavailable === true,
    comments: record.comments.flatMap((comment): GeniusComment[] => {
      if (!comment || typeof comment !== 'object') return []
      const item = comment as Record<string, unknown>
      if (typeof item.id !== 'string' || typeof item.body !== 'string' || typeof item.author !== 'string') return []
      return [{
        id: item.id,
        body: item.body,
        author: item.author,
        avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : undefined,
        score: typeof item.score === 'number' ? item.score : undefined,
      }]
    }),
    nextPage: typeof record.nextPage === 'number' && record.nextPage > 0 ? record.nextPage : undefined,
  }
}

function mergeComments(existing: GeniusComment[], incoming: GeniusComment[]) {
  const knownIds = new Set(existing.map((comment) => comment.id))
  return [...existing, ...incoming.filter((comment) => !knownIds.has(comment.id))]
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something unexpected happened.'
}

export default App
