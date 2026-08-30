import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LyricDocument } from '../domain'
import { LyricReader } from './LyricReader'

const document: LyricDocument = {
  track: {
    id: 'paper-test',
    title: 'Paper Test',
    artist: 'The Fixtures',
    collection: 'Test Sheets',
    source: 'fixture',
  },
  lines: [
    { id: 'one', text: 'A line remains readable without the scene.' },
    { id: 'two', text: 'Presentation state stays provider-neutral.' },
  ],
}

describe('LyricReader', () => {
  it('renders a semantic lyric document without provider response fields', () => {
    const { container } = render(<LyricReader document={document} state={{ focusMode: false }} />)

    expect(screen.getByRole('article')).toHaveAttribute('aria-labelledby', 'lyric-reader-title')
    expect(screen.getByRole('heading', { level: 1, name: 'The Fixtures' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Paper Test' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'lyrics for Paper Test' })).toHaveTextContent(
      'Presentation state stays provider-neutral.',
    )
    expect(container.querySelector('.lyric-reader__line-number')).toBeNull()
  })

  it('does not expose a current lyric indicator', () => {
    const { container, rerender } = render(
      <LyricReader document={document} state={{ focusMode: false }} />,
    )

    rerender(<LyricReader document={document} state={{ focusMode: true }} />)

    expect(container.querySelector('.lyric-reader')).toHaveClass('lyric-reader--focus')
    expect(container.querySelectorAll('.lyric-reader__line[aria-current]')).toHaveLength(0)
    expect(container.querySelectorAll('.lyric-reader__line[data-active]')).toHaveLength(0)
  })

  it('keeps the pinned identity readable while lyrics pass beneath it', () => {
    const { container } = render(<LyricReader document={document} state={{ focusMode: false }} />)
    const identity = container.querySelector('.lyric-reader__identity') as HTMLDivElement
    const line = container.querySelector('.lyric-reader__line') as HTMLLIElement

    identity.getBoundingClientRect = () =>
      ({ top: 64, bottom: 360, height: 296 }) as DOMRect
    line.getBoundingClientRect = () =>
      ({ top: 320, bottom: 350 }) as DOMRect

    fireEvent.scroll(window)

    expect(identity).not.toHaveClass('lyric-reader__identity--cleared')
    expect(line.style.getPropertyValue('--lyric-reveal-opacity')).toBe('0.000')

    line.getBoundingClientRect = () =>
      ({ top: 430, bottom: 470 }) as DOMRect
    fireEvent.scroll(window)

    expect(identity).not.toHaveClass('lyric-reader__identity--cleared')
    expect(line.style.getPropertyValue('--lyric-reveal-opacity')).toBe('1.000')
  })

  it('keeps the lyric text in a separate ink layer for backdrop blending', () => {
    const { container } = render(<LyricReader document={document} state={{ focusMode: false }} />)

    expect(container.querySelector('.lyric-reader__line-ink-base')).toHaveTextContent(
      'A line remains readable without the scene.',
    )
    expect(container.querySelector('.lyric-reader__line-ink-blend')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
