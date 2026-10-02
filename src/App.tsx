import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Dispatch, KeyboardEvent } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { LyricsProvider, LyricsSearchField, TrackSummary } from './domain'
import { initialLookupState, lookupReducer } from './app/lookupReducer'
import { TiramisuLyricsProvider } from './lookup'
import { decodeLrcMuxTrackSummary } from './lookup/LrcMuxLyricsProvider'
import { classifyLyricsFailure } from './lookup/lyricsFailure'
import { CommentsPanel } from './comments/CommentsPanel'
import type { CommentsStatus, GeniusComment, GeniusCommentsResponse } from './comments/CommentsPanel'
import type { AmbientCanvasProps } from './presentation/AmbientCanvas'
import { FocusModeToggle } from './presentation/FocusModeToggle'
import { LyricReader } from './presentation/LyricReader'
import { ResultSymbolToy } from './presentation/ResultSymbolToy'
import { ThemeToggle } from './presentation/ThemeToggle'
import { ThemeProvider } from './theme'
import './styles/presentation.css'
import './App.css'
import './styles/bloom.css'

const LYRICS_FAILURE_COPY = {
  'not-found': ['lyrics not found', 'we couldn’t find lyrics for this recording yet.', 'the current sources returned no readable lyric sheet. you can retry later or search Genius.'],
  instrumental: ['instrumental', 'this recording has no sung lyrics.', 'the source identifies this recording as instrumental.'],
  restricted: ['source restricted', 'the source does not allow this request.', 'lyrics access is restricted. you can open an external search for this song.'],
  ambiguous: ['recording unconfirmed', 'the source could not confirm this recording.', 'its title, artist, album, or duration did not uniquely match the selected recording.'],
  'provider-unavailable': ['source unavailable', 'the lyric source is temporarily unavailable.', 'please retry after the source recovers. this does not mean the lyrics are missing.'],
} as const

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
  return (
    <ThemeProvider>
      <nav className="cluster-nav" aria-label="cluster"><a className="cluster-return" href="https://shin86.dev/"><span aria-hidden="true">←</span> shin86.dev</a><a className="cluster-return community-link" href="https://discord.gg/d6Q4yJuMgP" target="_blank" rel="noopener noreferrer">Egghead Island ↗</a></nav>
      <a className="skip-link" href="#main-content">skip to content</a>
      <AppRoutes provider={provider} />
    </ThemeProvider>
  )
}

function searchUrl(query: string, field: LyricsSearchField): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (field !== 'smart') params.set('by', field)
  return params.size ? `/?${params}` : '/'
}

interface SearchReturnPosition {
  scrollY: number
  trackId: string
}

function AppRoutes({ provider }: { provider: LyricsProvider }) {
  const [state, dispatch] = useReducer(lookupReducer, initialLookupState)
  const [searchField, setSearchField] = useState<LyricsSearchField>('smart')
  const [submitted, setSubmitted] = useState({ query: '', field: 'smart' as LyricsSearchField })
  const searchRequestId = useRef(0)
  const searchController = useRef<AbortController | null>(null)
  const searchTimeout = useRef<number | null>(null)
  const lastSearchUrl = useRef<string | null>(null)
  const returnPosition = useRef<SearchReturnPosition | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const search = useCallback(async (query: string, field: LyricsSearchField) => {
    searchController.current?.abort()
    if (searchTimeout.current !== null) window.clearTimeout(searchTimeout.current)
    const controller = new AbortController()
    const requestId = ++searchRequestId.current
    searchController.current = controller
    lastSearchUrl.current = searchUrl(query, field)
    setSubmitted({ query, field })
    setSearchField(field)
    dispatch({ type: 'queryChanged', query })
    dispatch({ type: 'searchStarted', requestId })
    const timeout = window.setTimeout(() => {
      controller.abort()
      dispatch({ type: 'searchFailed', requestId, error: 'The search took too long. Please try again.' })
    }, 20_000)
    searchTimeout.current = timeout

    try {
      const results = await provider.search(query, controller.signal, field)
      if (!controller.signal.aborted) dispatch({ type: 'searchSucceeded', requestId, results })
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      dispatch({ type: 'searchFailed', requestId, error: messageFrom(error) })
    } finally {
      window.clearTimeout(timeout)
      if (searchTimeout.current === timeout) searchTimeout.current = null
    }
  }, [provider])

  useEffect(() => {
    if (location.pathname !== '/') return
    const params = new URLSearchParams(location.search)
    const query = (params.get('q') ?? '').trim().replace(/\s+/g, ' ')
    const mode = params.get('by')
    const field = mode === 'title' || mode === 'artist' ? mode : 'smart'
    const url = searchUrl(query, field)
    if (lastSearchUrl.current === url) return
    returnPosition.current = null
    void search(query, field)
  }, [location.pathname, location.search, search])

  useEffect(() => () => {
    searchController.current?.abort()
    lastSearchUrl.current = null
    if (searchTimeout.current !== null) window.clearTimeout(searchTimeout.current)
  }, [provider])

  const submitSearch = async (query: string, field: LyricsSearchField) => {
    const normalizedQuery = query.trim().replace(/\s+/g, ' ')
    const url = searchUrl(normalizedQuery, field)
    returnPosition.current = null
    if (`${location.pathname}${location.search}` === url) {
      await search(normalizedQuery, field)
    } else {
      navigate(url)
    }
  }

  return (
    <Routes>
      <Route path="/" element={
        <SearchView
          query={state.query}
          submittedQuery={submitted.query}
          status={state.searchStatus}
          results={state.results}
          error={state.searchError}
          searchField={searchField}
          onQueryChange={(query) => dispatch({ type: 'queryChanged', query })}
          onSearchFieldChange={setSearchField}
          onSearch={submitSearch}
          onRetry={() => search(submitted.query, submitted.field)}
          returnPosition={returnPosition}
          onOpen={(trackId) => {
            returnPosition.current = { scrollY: window.scrollY, trackId }
            navigate(`/lyrics/${trackId}`)
          }}
        />
      } />
      <Route path="/lyrics/:trackId" element={
        <LyricsView provider={provider} state={state} dispatch={dispatch}
          returnUrl={searchUrl(submitted.query, submitted.field)} />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

interface SearchViewProps {
  query: string
  submittedQuery: string
  onRetry: () => Promise<void>
  onOpen: (trackId: string) => void
  returnPosition: { current: SearchReturnPosition | null }
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
  submittedQuery,
  onRetry,
  onOpen,
  returnPosition,
  status,
  results,
  error,
  searchField,
  onQueryChange,
  onSearchFieldChange,
  onSearch,
}: SearchViewProps) {
  const shelfRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (status !== 'ready' || !returnPosition.current) return
    const position = returnPosition.current
    const frame = requestAnimationFrame(() => {
      const card = Array.from(shelfRef.current?.querySelectorAll<HTMLButtonElement>('[data-track-id]') ?? [])
        .find((button) => button.dataset.trackId === position.trackId)
      card?.focus({ preventScroll: true })
      window.scrollTo({ top: position.scrollY, behavior: 'instant' })
      returnPosition.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [status, returnPosition])
  const isLoading = status === 'loading'
  const resultCount = status === 'ready'
    ? submittedQuery
      ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}`
      : `${results.length} lyric ${results.length === 1 ? 'sheet' : 'sheets'}`
    : ''

  return (
    <main id="main-content" className="search-view" tabIndex={-1}>
      <AmbientLayer variant="search" />
      <div className="search-view__frame">
        <header className="search-view__masthead">
          <h1 className="wordmark">
            <Link to="/" aria-label="tiramisu home">
              <span className="wordmark__dot" aria-hidden="true" />
              tiramisu
            </Link>
          </h1>
          <ThemeToggle />
        </header>

        <section className="search-hero" aria-label="Lyric search">
          <div className="canopy-space canopy-space--search" aria-hidden="true" />
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
                placeholder="Song title or artist"
                aria-describedby="search-hint"
                autoComplete="off"
                enterKeyHint="search"
                onChange={(event) => onQueryChange(event.target.value)}
              />
              <button type="submit">
                <span>Look up</span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="search-form__help">
              <p id="search-hint">try a song title, artist, or both.</p>
              {query || submittedQuery ? (
                <button type="button" onClick={() => void onSearch('', 'smart')}>clear search</button>
              ) : null}
            </div>
          </form>
        </section>

        <section
          className="result-shelf"
          aria-labelledby="result-heading"
          aria-busy={isLoading}
        >
          <div className="result-shelf__heading">
            <h2 id="result-heading">{submittedQuery ? `results for “${submittedQuery}”` : 'lyrics'}</h2>
            <span className="result-shelf__count">
              {resultCount ? <span className="result-shelf__count-dot" aria-hidden="true" /> : null}
              {resultCount}
            </span>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {isLoading
              ? `Looking for ${submittedQuery || 'lyrics'}.`
              : status === 'ready'
                ? `${results.length} ${submittedQuery ? `${results.length === 1 ? 'match' : 'matches'} for “${submittedQuery}”` : 'lyric sheets'}. Select a result to open its lyric sheet.`
                : ''}
          </p>

          {isLoading ? <p className="search-feedback">looking for {submittedQuery ? `“${submittedQuery}”` : 'lyric sheets'}…</p> : null}

          {status === 'error' ? (
            <div className="lookup-message" role="alert">
              <p>Couldn’t load lyrics.</p>
              <span>{error?.includes('took too long') ? error : 'check your connection and try again.'}</span>
              <button type="button" onClick={() => void onRetry()}>try again</button>
            </div>
          ) : null}

          {status === 'ready' && results.length === 0 ? (
            <div className="lookup-message">
              <p>No lyric sheet matched “{submittedQuery}”.</p>
              <span>try fewer words, or switch between title and artist.</span>
              <button type="button" onClick={() => void onSearch('', 'smart')}>Show all</button>
            </div>
          ) : null}

          <ol ref={shelfRef} className="result-list" hidden={status !== 'ready'}>
            {results.map((track, index) => (
              <li key={track.id}>
                <button
                  type="button"
                  className="result-card"
                  data-track-id={track.id}
                  onClick={() => onOpen(track.id)}
                >
                  <span className="result-card__identity">
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                    {track.collection && track.collection !== 'Unknown album' ? <span className="result-card__collection">{track.collection}</span> : null}
                    {track.lyricsAvailability === 'unknown' ? <span className="result-card__collection">lyrics not confirmed</span> : null}
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
  returnUrl: string
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

function LyricsView({ provider, state, dispatch, returnUrl }: LyricsViewProps) {
  const { trackId } = useParams()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [trackId])
  const navigate = useNavigate()
  const lyricsRequestId = useRef(0)
  const [lyricsAttempt, setLyricsAttempt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [focusMode, setFocusMode] = useState(false)
  const [trackComments, setTrackComments] = useState<TrackCommentsState>(initialTrackCommentsState)
  const commentsController = useRef<AbortController | null>(null)
  const commentsRequestId = useRef(0)
  const lyricScrollPosition = useRef(0)
  const lyricsTabRef = useRef<HTMLButtonElement>(null)
  const commentsTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!trackId) return undefined

    const controller = new AbortController()
    const requestId = ++lyricsRequestId.current
    dispatch({ type: 'lyricsStarted', requestId, id: trackId })
    const timeout = setTimeout(() => {
      dispatch({type: 'lyricsFailed', requestId, error: 'The lyric request took too long.', failure: {kind: 'provider-unavailable'}})
      controller.abort()
    }, 20_000)

    void provider
      .getLyrics(trackId, controller.signal)
      .then((document) => {
        if (!controller.signal.aborted) dispatch({ type: 'lyricsSucceeded', requestId, document })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        setNow(Date.now())
        dispatch({ type: 'lyricsFailed', requestId, error: messageFrom(error), failure: classifyLyricsFailure(error) })
      })

      .finally(() => clearTimeout(timeout))

    return () => { clearTimeout(timeout); controller.abort() }
  }, [dispatch, provider, trackId, lyricsAttempt])

  useEffect(() => {
    if (!state.lyricsFailure?.retryAt) return undefined
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [state.lyricsFailure?.retryAt])

  useEffect(() => {
    commentsController.current?.abort()
    commentsController.current = null
    commentsRequestId.current += 1

    return () => commentsController.current?.abort()
  }, [trackId])

  // A stale saved link can resolve through another provider while the URL keeps
  // its original ID. The selected request ID, not the returned source ID,
  // determines whether the document belongs to this reader route.
  const document = state.selectedTrackId === trackId ? state.document : null

  if (state.selectedTrackId === trackId && state.lyricsStatus === 'error') {
    const kind = state.lyricsFailure?.kind ?? 'provider-unavailable'
    const [label, heading, explanation] = LYRICS_FAILURE_COPY[kind]
    let track = state.results.find((candidate) => candidate.id === trackId)
    if (!track && trackId?.startsWith('lrcmux:')) {
      try { track = decodeLrcMuxTrackSummary(trackId) } catch { /* Invalid IDs have no safe identity. */ }
    }
    const retrySeconds = Math.max(0, Math.ceil(((state.lyricsFailure?.retryAt ?? 0) - now) / 1000))
    return (
      <main id="main-content" className="reader-state" tabIndex={-1}>
        <AmbientLayer variant="reader" />
        <div className="canopy-space canopy-space--reader" aria-hidden="true" />
        <p className="eyebrow">{label}</p>
        <h1>{heading}</h1>
        {track ? <p>{track.title} — {track.artist}</p> : null}
        <p>{explanation}</p>
        <div className="reader-state__actions">
          {kind === 'not-found' || kind === 'provider-unavailable' ? (
            <button type="button" disabled={retrySeconds > 0} onClick={() => setLyricsAttempt((value) => value + 1)}>
              {retrySeconds > 0 ? `retry in ${retrySeconds}s` : 'retry lyrics'}
            </button>
          ) : null}
          {track ? <a href={`https://genius.com/search?q=${encodeURIComponent(`${track.title} ${track.artist}`)}`} target="_blank" rel="noopener noreferrer">search Genius ↗</a> : null}
          {track ? <a href={`https://open.spotify.com/search/${encodeURIComponent(`${track.title} ${track.artist}`)}`} target="_blank" rel="noopener noreferrer">find on Spotify ↗</a> : null}
          <button type="button" onClick={() => navigate(returnUrl)}>Back to search</button>
        </div>
      </main>
    )
  }

  if (!document) {
    return (
      <main id="main-content" className="reader-state" tabIndex={-1} aria-busy="true">
        <AmbientLayer variant="reader" />
        <div className="canopy-space canopy-space--reader" aria-hidden="true" />
        <span className="reader-state__loader" aria-hidden="true" />
        <p>Opening the lyric sheet…</p>
      </main>
    )
  }

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
          // Finishing a request must not undo a return to lyrics while it loaded.
          mode: previous.mode,
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
      setTrackComments((previous) => ({ trackId, mode: previous.mode, status: 'error', response: null }))
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

  const handleReaderTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    const nextMode = event.key === 'ArrowRight' || event.key === 'End' ? 'comments' : 'lyrics'
    if (nextMode === 'comments') {
      showComments()
      commentsTabRef.current?.focus()
      return
    }

    showLyrics()
    lyricsTabRef.current?.focus()
  }

  return (
    <main id="main-content" className="reader-view" tabIndex={-1} data-focus={focusMode}>
      <AmbientLayer variant="reader" />
      <nav className="reader-tools" aria-label="Reader controls">
        <button className="reader-tools__back" tabIndex={focusMode ? -1 : 0} type="button" onClick={() => navigate(returnUrl)}>
          <span aria-hidden="true">←</span>
          <span>Search</span>
        </button>
        <div className="reader-tools__end">
          <ThemeToggle />
          {!focusMode ? (
            <div className="reader-mode-toggle" role="tablist" aria-label="Reader view">
              <button
                ref={lyricsTabRef}
                id="reader-mode-lyrics"
                type="button"
                role="tab"
                aria-selected={comments.mode === 'lyrics'}
                aria-controls="reader-lyrics-panel"
                tabIndex={comments.mode === 'lyrics' ? 0 : -1}
                onKeyDown={handleReaderTabKeyDown}
                onClick={showLyrics}
              >
                Lyrics
              </button>
              <button
                ref={commentsTabRef}
                id="reader-mode-comments"
                type="button"
                role="tab"
                aria-selected={comments.mode === 'comments'}
                aria-controls="reader-comments-panel"
                tabIndex={comments.mode === 'comments' ? 0 : -1}
                onKeyDown={handleReaderTabKeyDown}
                onClick={showComments}
              >
                Annotations
              </button>
            </div>
          ) : null}
          <FocusModeToggle isFocused={focusMode} onToggle={setFocus} />
        </div>
      </nav>
      <div className="canopy-space canopy-space--reader" aria-hidden="true" />
      <section
        id="reader-lyrics-panel"
        role="tabpanel"
        aria-labelledby="reader-mode-lyrics"
        hidden={!focusMode && comments.mode !== 'lyrics'}
      >
        <LyricReader
          document={document}
          state={{ focusMode }}
        />
      </section>
      {!focusMode ? (
        <CommentsPanel
          status={comments.status}
          response={comments.response}
          track={{ title: document.track.title, artist: document.track.artist }}
          hidden={comments.mode !== 'comments'}
          onRetry={() => void fetchComments(1)}
          onReturnToLyrics={showLyrics}
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
