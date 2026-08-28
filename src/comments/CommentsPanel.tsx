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
  onLoadMore: () => void
  hidden?: boolean
}

export function CommentsPanel({ status, response, onLoadMore, hidden = false }: CommentsPanelProps) {
  const comments = response?.comments ?? []
  const isLoading = status === 'loading'

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
        <p className="reader-comments__eyebrow">comments</p>
        <h1>notes around the song</h1>
        {response?.songUrl ? (
          <a href={response.songUrl} target="_blank" rel="noreferrer">
            Comments from Genius <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <p className="reader-comments__attribution">Comments from Genius</p>
        )}
      </header>

      {status === 'idle' || isLoading ? (
        <p className="reader-comments__message" role="status">
          Gathering the margin notes…
        </p>
      ) : null}

      {status === 'error' || response?.commentsUnavailable ? (
        <div className="reader-comments__message" role="alert">
          <p>Comments are unavailable right now.</p>
          <span>Your lyric sheet is still here.</span>
        </div>
      ) : null}

      {status === 'ready' && !response?.commentsUnavailable && comments.length === 0 ? (
        <p className="reader-comments__message">
          No public comments came back for this song.
        </p>
      ) : null}

      {comments.length > 0 ? (
        <ol className="reader-comments__list">
          {comments.map((comment, index) => (
            <li key={comment.id} className="reader-comments__item">
              <article>
                <span className="reader-comments__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="reader-comments__body">{comment.body}</p>
                <footer>
                  <span>{comment.author}</span>
                  {typeof comment.score === 'number' ? <span>{comment.score} notes</span> : null}
                </footer>
              </article>
            </li>
          ))}
        </ol>
      ) : null}

      {response?.nextPage ? (
        <button className="reader-comments__more" type="button" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  )
}
