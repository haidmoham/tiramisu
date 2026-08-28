export interface GeniusComment {
  id: string
  body: string
  author: string
  avatarUrl?: string
  score?: number
}

export interface GeniusCommentsResponse {
  songUrl?: string
  comments: GeniusComment[]
  nextPage?: number
  commentsUnavailable?: boolean
}

export type CommentsStatus = 'idle' | 'loading' | 'ready' | 'error'

interface CommentsPanelProps {
  status: CommentsStatus
  response: GeniusCommentsResponse | null
  track: {
    title: string
    artist: string
  }
  onLoadMore: () => void
  onRetry: () => void
  onReturnToLyrics: () => void
  hidden?: boolean
}

export function CommentsPanel({
  status,
  response,
  track,
  onLoadMore,
  onRetry,
  onReturnToLyrics,
  hidden = false,
}: CommentsPanelProps) {
  const comments = response?.comments ?? []
  const isLoading = status === 'loading'
  const isInitialLoading = (status === 'idle' || isLoading) && comments.length === 0
  const isLoadingMore = isLoading && comments.length > 0
  const commentCountLabel = `${comments.length} public ${comments.length === 1 ? 'note' : 'notes'}`
  const songUrl = response?.songUrl

  return (
    <section
      className="reader-comments"
      id="reader-comments-panel"
      role="tabpanel"
      aria-labelledby="reader-mode-comments"
      aria-busy={isLoading}
      hidden={hidden}
    >
      <header className="reader-comments__header">
        <div className="reader-comments__heading-copy">
          <p className="reader-comments__eyebrow">
            <span aria-hidden="true" />
            comments / {track.artist}
          </p>
          <p className="reader-comments__overline">notes on</p>
          <h1>{track.title}</h1>
        </div>
        {songUrl ? (
          <a
            className="reader-comments__source"
            href={songUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open this song on Genius"
          >
            <span>source</span>
            <strong>Genius</strong>
            <span className="reader-comments__source-arrow" aria-hidden="true">↗</span>
          </a>
        ) : (
          <p className="reader-comments__source" aria-label="Comments source: Genius">
            <span>source</span>
            <strong>Genius</strong>
          </p>
        )}
      </header>

      {isInitialLoading ? (
        <section className="reader-comments__state reader-comments__state--loading" role="status">
          <span className="reader-comments__state-mark" aria-hidden="true" />
          <div>
            <p className="reader-comments__state-kicker">checking the margins</p>
            <h2>Gathering the public notes…</h2>
            <p>Matching this lyric sheet with its Genius discussion.</p>
            <div className="reader-comments__loading-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </section>
      ) : null}

      {status === 'error' ? (
        <section className="reader-comments__state reader-comments__state--error" role="alert">
          <span className="reader-comments__state-mark" aria-hidden="true">!</span>
          <div>
            <p className="reader-comments__state-kicker">connection missed</p>
            <h2>We couldn’t reach the notes.</h2>
            <p>The lyric sheet is safe. Retry the request or return to reading.</p>
            <div className="reader-comments__actions">
              <button type="button" onClick={onRetry}>Try again</button>
              <button type="button" onClick={onReturnToLyrics}>Back to lyrics</button>
            </div>
          </div>
        </section>
      ) : null}

      {status === 'ready' && response?.commentsUnavailable ? (
        <section className="reader-comments__state reader-comments__state--unavailable" role="alert">
          <span className="reader-comments__state-mark" aria-hidden="true">×</span>
          <div>
            <p className="reader-comments__state-kicker">source unavailable</p>
            <h2>Genius notes aren’t available here right now.</h2>
            <p>Nothing about the lyric sheet changed. Keep reading here or open the matched song at the source.</p>
            <div className="reader-comments__actions">
              <button type="button" onClick={onReturnToLyrics}>Back to lyrics</button>
              {songUrl ? (
                <a href={songUrl} target="_blank" rel="noreferrer">
                  Open on Genius <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {status === 'ready' && !response?.commentsUnavailable && comments.length === 0 ? (
        <section className="reader-comments__state reader-comments__state--empty">
          <span className="reader-comments__state-mark" aria-hidden="true" />
          <div>
            <p className="reader-comments__state-kicker">clear margins</p>
            <h2>No public notes came back for this song.</h2>
            <p>The absence is real—we won’t fill the page with invented discussion.</p>
            <div className="reader-comments__actions">
              <button type="button" onClick={onReturnToLyrics}>Back to lyrics</button>
              {songUrl ? (
                <a href={songUrl} target="_blank" rel="noreferrer">
                  Open on Genius <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {comments.length > 0 ? (
        <div className="reader-comments__collection">
          <div className="reader-comments__collection-heading">
            <h2>public margin notes</h2>
            <span>{commentCountLabel}</span>
          </div>
          <ol className="reader-comments__list">
            {comments.map((comment) => (
              <li key={comment.id} className="reader-comments__item">
                <article>
                  <p className="reader-comments__body">{comment.body}</p>
                  <footer>
                    <span>{comment.author}</span>
                    {typeof comment.score === 'number' ? (
                      <span>{comment.score} {comment.score === 1 ? 'note' : 'notes'}</span>
                    ) : null}
                  </footer>
                </article>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {isLoadingMore ? <p className="reader-comments__more-status" role="status">Adding more notes…</p> : null}

      {response?.nextPage ? (
        <button className="reader-comments__more" type="button" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}

    </section>
  )
}
