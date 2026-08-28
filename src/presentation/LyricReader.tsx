import { useEffect, useRef } from 'react'
import type { LyricDocument, LyricLine } from '../domain/lyrics'
import { resolveActiveLyricIndex } from './lyricProgress'

/** The small state surface the app can own without coupling the reader to lookup. */
export interface PresentationState {
  focusMode: boolean
  activeLineId?: LyricLine['id']
}

export interface LyricReaderProps {
  document: LyricDocument
  state: PresentationState
  className?: string
  onActiveLineChange?: (lineId: LyricLine['id']) => void
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function LyricReader({
  document,
  state,
  className,
  onActiveLineChange,
}: LyricReaderProps) {
  const readerRef = useRef<HTMLElement>(null)
  const identityRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef(new Map<LyricLine['id'], HTMLLIElement>())
  const activeLineCallbackRef = useRef(onActiveLineChange)
  const lastReportedLineRef = useRef<LyricLine['id'] | undefined>(undefined)

  useEffect(() => {
    activeLineCallbackRef.current = onActiveLineChange
  }, [onActiveLineChange])

  useEffect(() => {
    const reader = readerRef.current
    if (!reader) return undefined
    lastReportedLineRef.current = undefined

    const reportProgress = () => {
      const identity = identityRef.current
      if (!identity) return

      const glass = identity.getBoundingClientRect()
      const anchor = state.focusMode
        ? Math.max(72, Math.min(window.innerHeight * 0.18, 160))
        : glass.bottom + 8
      const lines = document.lines
        .map((line) => lineRefs.current.get(line.id))
        .filter((line): line is HTMLLIElement => Boolean(line))
      const lineBounds = lines.map((line) => line.getBoundingClientRect())
      const activeIndex = resolveActiveLyricIndex(lineBounds, anchor)
      const activeLineId = document.lines[activeIndex]?.id

      if (activeLineId && activeLineId !== lastReportedLineRef.current) {
        lastReportedLineRef.current = activeLineId
        activeLineCallbackRef.current?.(activeLineId)
      }

      const tail = tailRef.current
      const lastBounds = lineBounds.at(-1)
      if (tail && lastBounds) {
        const readerPaddingBottom = Number.parseFloat(getComputedStyle(reader).paddingBottom) || 0
        const tailHeight = Math.max(
          96,
          window.innerHeight - anchor - (lastBounds.bottom - lastBounds.top) - readerPaddingBottom,
        )
        const nextTailHeight = `${Math.round(tailHeight)}px`
        if (tail.style.blockSize !== nextTailHeight) tail.style.blockSize = nextTailHeight
      }

      if (state.focusMode) return

      const feather = Math.min(56, Math.max(32, glass.height * 0.18))

      lines.forEach((line) => {
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
            <p className="lyric-reader__line-text">
              <span className="lyric-reader__line-ink">
                <span className="lyric-reader__line-ink-blend" aria-hidden="true">
                  {line.text}
                </span>
                <span className="lyric-reader__line-ink-base">{line.text}</span>
              </span>
            </p>
          </li>
        ))}
      </ol>

      <div ref={tailRef} className="lyric-reader__tail" aria-hidden="true" />

    </article>
  )
}
