import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CommentsPanel } from './CommentsPanel'

const track = { title: 'This Modern Love', artist: 'Bloc Party' }

function renderPanel(
  props: Partial<ComponentProps<typeof CommentsPanel>> = {},
) {
  const onLoadMore = vi.fn()
  const onRetry = vi.fn()
  const onReturnToLyrics = vi.fn()
  render(
    <CommentsPanel
      status="ready"
      response={{ comments: [] }}
      track={track}
      onLoadMore={onLoadMore}
      onRetry={onRetry}
      onReturnToLyrics={onReturnToLyrics}
      {...props}
    />,
  )
  return { onLoadMore, onRetry, onReturnToLyrics }
}

describe('CommentsPanel states', () => {
  it('shows a purposeful loading composition tied to the track', () => {
    renderPanel({ status: 'loading', response: null })

    expect(screen.getByRole('heading', { name: 'This Modern Love' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Gathering the public notes…')
    expect(screen.getByLabelText('Comments source: Genius')).toBeVisible()
  })

  it('shows genuine populated notes with source, author, score, and count', () => {
    renderPanel({
      response: {
        songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
        comments: [{ id: 'note-1', body: 'A real public note.', author: 'Mina', score: 1 }],
      },
    })

    expect(screen.getByText('1 public note')).toBeVisible()
    expect(screen.getByText('A real public note.')).toBeVisible()
    expect(screen.getByText('Mina')).toBeVisible()
    expect(screen.getByText('1 note')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open this song on Genius' })).toHaveAttribute(
      'href',
      'https://genius.com/Bloc-party-this-modern-love-lyrics',
    )
  })

  it('keeps an honest empty state and offers useful exits', async () => {
    const user = userEvent.setup()
    const { onReturnToLyrics } = renderPanel({
      response: {
        songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
        comments: [],
      },
    })

    expect(screen.getByRole('heading', { name: 'No public notes came back for this song.' })).toBeVisible()
    expect(screen.getByText(/won’t fill the page with invented discussion/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back to lyrics' }))
    expect(onReturnToLyrics).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: /Open on Genius/ })).toBeVisible()
  })

  it('makes the Genius-unavailable state useful without inventing content', async () => {
    const user = userEvent.setup()
    const { onReturnToLyrics } = renderPanel({
      response: {
        songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
        comments: [],
        commentsUnavailable: true,
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Genius notes aren’t available here right now.')
    expect(screen.getAllByRole('link', { name: /Genius/ })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Back to lyrics' }))
    expect(onReturnToLyrics).toHaveBeenCalledTimes(1)
  })

  it('offers retry after a request error', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderPanel({ status: 'error', response: null })

    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t reach the notes.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
