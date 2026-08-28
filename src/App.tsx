import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import type { LyricsProvider, TrackSummary } from './domain'
import { initialLookupState, lookupReducer } from './app/lookupReducer'
import { TiramisuLyricsProvider } from './lookup'
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
  const searchRequestId = useRef(0)
  const searchController = useRef<AbortController | null>(null)

  const search = useCallback(async (query: string) => {
    searchController.current?.abort()
    const controller = new AbortController()
    const requestId = ++searchRequestId.current
    searchController.current = controller
    dispatch({ type: 'searchStarted', requestId })

    try {
      const results = await provider.search(query, controller.signal)
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
            onQueryChange={(query) => dispatch({ type: 'queryChanged', query })}
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
  onQueryChange: (query: string) => void
  onSearch: (query: string) => Promise<void>
}

function SearchView({
  query,
  status,
  results,
  error,
  onQueryChange,
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
              void onSearch(query)
            }}
          >
            <label className="search-form__label" htmlFor="lyric-search">
              Search the lyric sheets
            </label>
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
            <span>{status === 'ready' ? `${results.length}` : ''}</span>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {isLoading ? 'looking for lyrics' : status === 'ready' ? `${results.length} results` : ''}
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
              <button type="button" onClick={() => void onSearch('')}>Show all</button>
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

type AppState = ReturnType<typeof lookupReducer>
type AppDispatch = Dispatch<Parameters<typeof lookupReducer>[1]>

interface LyricsViewProps {
  provider: LyricsProvider
  state: AppState
  dispatch: AppDispatch
}

function LyricsView({ provider, state, dispatch }: LyricsViewProps) {
  const { trackId } = useParams()
  const navigate = useNavigate()
  const lyricsRequestId = useRef(0)
  const [focusMode, setFocusMode] = useState(false)
  const [activeLineId, setActiveLineId] = useState<string | undefined>()
  const [canvasAvailable, setCanvasAvailable] = useState(true)

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

  const document = state.document?.track.id === trackId ? state.document : null

  const onScrollProgress = useCallback(
    (progress: number) => {
      if (!document) return
      const index = Math.min(document.lines.length - 1, Math.floor(progress * document.lines.length))
      setActiveLineId(document.lines[Math.max(0, index)]?.id)
    },
    [document],
  )

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

  return (
    <main className="reader-view" data-focus={focusMode} data-canvas={canvasAvailable}>
      {canvasAvailable ? <AmbientLayer onFallback={() => setCanvasAvailable(false)} /> : null}
      <nav className="reader-tools" aria-label="Reader controls">
        <button className="reader-tools__back" type="button" onClick={() => navigate('/')}>
          <span aria-hidden="true">←</span>
          <span>Search</span>
        </button>
        <FocusModeToggle isFocused={focusMode} onToggle={setFocusMode} />
      </nav>
      <LyricReader
        document={document}
        state={{ focusMode, activeLineId }}
        onScrollProgress={onScrollProgress}
      />
    </main>
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something unexpected happened.'
}

export default App
