import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'
import '../styles/result-symbol-toy.css'

export interface ResultSymbolToyProps {
  /** A stable track id (optionally paired with the result index) for a distinct composition. */
  seed: string | number
  className?: string
}

type SymbolProfile = {
  variant: number
  tilt: number
  offset: number
}

function profileFor(seed: string | number): SymbolProfile {
  const source = String(seed)
  let hash = 2166136261

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return {
    variant: Math.abs(hash) % 3,
    tilt: (Math.abs(hash >>> 8) % 15) - 7,
    offset: Math.abs(hash >>> 16) % 7,
  }
}

/**
 * An ink-only, non-semantic toy for a result row. Pointer movement only retargets
 * CSS transform transitions, so it has follow-through without owning an animation loop.
 */
export function ResultSymbolToy({ seed, className }: ResultSymbolToyProps) {
  const toyRef = useRef<HTMLSpanElement>(null)
  const orbitRef = useRef<SVGGElement>(null)
  const sparkRef = useRef<SVGGElement>(null)
  const triangleRef = useRef<SVGGElement>(null)
  const releaseTimer = useRef<number | undefined>(undefined)
  const profile = profileFor(seed)

  useEffect(() => () => window.clearTimeout(releaseTimer.current), [])

  const resetMotion = () => {
    orbitRef.current?.style.removeProperty('transform')
    sparkRef.current?.style.removeProperty('transform')
    triangleRef.current?.style.removeProperty('transform')
  }

  const followPointer = (event: PointerEvent<HTMLSpanElement>, press = false) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5
    const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5
    const pressure = press ? 1.35 : 1

    if (orbitRef.current) {
      orbitRef.current.style.transform = `translate(${(-x * 7 * pressure).toFixed(2)}px, ${(-y * 5 * pressure).toFixed(2)}px) rotate(${(x * 12).toFixed(2)}deg)`
    }
    if (sparkRef.current) {
      sparkRef.current.style.transform = `translate(${(x * 9 * pressure).toFixed(2)}px, ${(y * 6 * pressure).toFixed(2)}px) rotate(${(-y * 18).toFixed(2)}deg) scale(${press ? 0.92 : 1})`
    }
    if (triangleRef.current) {
      triangleRef.current.style.transform = `translate(${(x * 4 * pressure).toFixed(2)}px, ${(-y * 8 * pressure).toFixed(2)}px) rotate(${(x * -9).toFixed(2)}deg) scale(${press ? 1.08 : 1})`
    }
  }

  const finishPress = () => {
    const toy = toyRef.current
    if (!toy) return

    toy.dataset.pressed = 'false'
    window.clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(resetMotion, 130)
  }

  const toyClassName = ['result-symbol-toy', className].filter(Boolean).join(' ')

  return (
    <span
      ref={toyRef}
      className={toyClassName}
      data-variant={profile.variant}
      data-pressed="false"
      aria-hidden="true"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') followPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch') followPointer(event)
      }}
      onPointerLeave={() => resetMotion()}
      onPointerDown={(event) => {
        toyRef.current?.setAttribute('data-pressed', 'true')
        followPointer(event, true)
      }}
      onPointerUp={finishPress}
      onPointerCancel={finishPress}
    >
      <svg viewBox="0 0 96 64" focusable="false" role="presentation">
        <g transform={`translate(${profile.offset} ${profile.offset / 2}) rotate(${profile.tilt} 48 32)`}>
          <g ref={orbitRef} className="result-symbol-toy__orbit">
            <circle cx="37" cy="32" r="16" />
            <path d="M18 32c5-12 15-19 29-19 11 0 21 6 28 16" />
          </g>
          <g ref={sparkRef} className="result-symbol-toy__spark">
            <path d="M62 14v12M56 20h12" />
            <path d="M68 35l7 7M75 35l-7 7" />
          </g>
          <g ref={triangleRef} className="result-symbol-toy__triangle">
            <path d="M60 47l10-17 10 17z" />
          </g>
        </g>
      </svg>
    </span>
  )
}
