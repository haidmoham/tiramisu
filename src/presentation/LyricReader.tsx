import { useEffect, useRef } from 'react'
import type { LyricDocument, LyricLine } from '../domain/lyrics'

/** The small state surface the app can own without coupling the reader to lookup. */
export interface PresentationState {
  focusMode: boolean
  activeLineId?: LyricLine['id']
}

export interface LyricReaderProps {
  document: LyricDocument
  state: PresentationState
  className?: string
  onScrollProgress?: (progress: number) => void
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function LyricReader({ document, state, className, onScrollProgress }: LyricReaderProps) {
  const readerRef = useRef<HTMLElement>(null)
  const identityRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef(new Map<LyricLine['id'], HTMLLIElement>())
  const progressCallbackRef = useRef(onScrollProgress)

  useEffect(() => {
    progressCallbackRef.current = onScrollProgress
  }, [onScrollProgress])

  useEffect(() => {
    const reader = readerRef.current
    if (!reader) return undefined

    const reportProgress = () => {
      const bounds = reader.getBoundingClientRect()
      const scrollableDistance = Math.max(1, reader.offsetHeight - window.innerHeight)
      progressCallbackRef.current?.(clamp(-bounds.top / scrollableDistance, 0, 1))

      const identity = identityRef.current
      if (!identity || state.focusMode) return

      const glass = identity.getBoundingClientRect()
      const feather = Math.min(56, Math.max(32, glass.height * 0.18))

      lineRefs.current.forEach((line) => {
        const bounds = line.getBoundingClientRect()
        const center = (bounds.top + bounds.bottom) / 2
        const progress = clamp((center - glass.bottom) / feather, 0, 1)
        // Once a line reaches the lower edge of the pinned identity it is
        // fully beneath the glass. It deliberately stays hidden as it moves on.
        const opacity = progress * progress * (3 - 2 * progress)

        line.style.setProperty('--lyric-glass-opacity', opacity.toFixed(3))
      })
    }

    const resizeObserver = new ResizeObserver(reportProgress)
    resizeObserver.observe(reader)
    window.addEventListener('scroll', reportProgress, { passive: true })
    reportProgress()

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('scroll', reportProgress)
    }
  }, [document, state.focusMode])

  const readerClassName = [
    'lyric-reader',
    state.focusMode ? 'lyric-reader--focus' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article ref={readerRef} className={readerClassName} aria-labelledby="lyric-reader-title">
      <div ref={identityRef} className="lyric-reader__identity">
        <header className="lyric-reader__header">
          <h1 id="lyric-reader-title" className="lyric-reader__artist">
            {document.track.artist}
          </h1>
          <h2 className="lyric-reader__title">{document.track.title}</h2>
        </header>
      </div>

      <hr className="lyric-reader__rule" />

      <ol className="lyric-reader__lines" aria-label={`lyrics for ${document.track.title}`}>
        {document.lines.map((line, index) => (
          <li
            ref={(element) => {
              if (element) lineRefs.current.set(line.id, element)
              else lineRefs.current.delete(line.id)
            }}
            key={line.id}
            id={`lyric-line-${line.id}`}
            className="lyric-reader__line"
            data-active={line.id === state.activeLineId}
            aria-current={line.id === state.activeLineId ? 'true' : undefined}
          >
            <span className="lyric-reader__line-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <p className="lyric-reader__line-text">{line.text}</p>
          </li>
        ))}
      </ol>

    </article>
  )
}
