import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { LyricDocument } from './domain'
import App from './App'
import { FixtureLyricsProvider } from './lookup'

vi.mock('./presentation/AmbientCanvas', () => ({
  AmbientCanvas: () => <canvas data-testid="ambient-canvas" />,
}))

vi.mock('./presentation/FocusModeToggle', () => ({
  FocusModeToggle: ({
    isFocused,
    onToggle,
  }: {
    isFocused: boolean
    onToggle: (value: boolean) => void
  }) => (
    <button type="button" onClick={() => onToggle(!isFocused)}>
      {isFocused ? 'Exit focus' : 'Focus reading'}
    </button>
  ),
}))

vi.mock('./presentation/LyricReader', () => ({
  LyricReader: ({ document }: { document: LyricDocument }) => (
    <article>
      <h1>{document.track.title}</h1>
      {document.lines.map((line) => (
        <p key={line.id}>{line.text}</p>
      ))}
    </article>
  ),
}))

vi.stubGlobal('scrollTo', vi.fn())

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App provider={new FixtureLyricsProvider({ latencyMs: 0 })} />
    </MemoryRouter>,
  )
}

describe('App routing and lookup states', () => {
  it('opens a stable lyric route from the fixture shelf', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: /This Modern Love/ }))

    expect(await screen.findByRole('heading', { name: 'This Modern Love' })).toBeInTheDocument()
    expect(screen.getByText('[Licensed lyrics are not loaded in this preview.]')).toBeInTheDocument()
  })

  it('labels the default shelf count instead of showing an unexplained number', async () => {
    renderApp()

    expect(await screen.findByText('3 lyric sheets')).toBeVisible()
  })

  it('renders a deliberate no-results state', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('button', { name: /This Modern Love/ })
    const input = screen.getByRole('searchbox')
    await user.type(input, 'not on this shelf')
    await user.click(screen.getByRole('button', { name: /Look up/ }))

    expect(await screen.findByText(/No lyric sheet matched/)).toBeInTheDocument()
  })

  it('renders the fixture provider failure without losing the search surface', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('button', { name: /This Modern Love/ })
    await user.type(screen.getByRole('searchbox'), 'fixture:fail')
    await user.click(screen.getByRole('button', { name: /Look up/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load lyrics.')
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('loads Genius comments only when the reader opens comments', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
      comments: [{ id: '1', body: 'A plain old song note.', author: 'Mina', score: 2 }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()

    await user.click(await screen.findByRole('button', { name: /This Modern Love/ }))
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'Comments' }))

    expect(await screen.findByText('A plain old song note.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/genius-comments?')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('title=This+Modern+Love')
    expect(screen.getByRole('link', { name: /Open this song on Genius/ })).toHaveAttribute(
      'href',
      'https://genius.com/Bloc-party-this-modern-love-lyrics',
    )

    await user.click(screen.getByRole('tab', { name: 'Lyrics' }))
    await user.click(screen.getByRole('tab', { name: 'Comments' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps lyrics intact when Genius comments fail and allows switching back', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
      comments: [],
      commentsUnavailable: true,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()

    await user.click(await screen.findByRole('button', { name: /This Modern Love/ }))
    await user.click(screen.getByRole('tab', { name: 'Comments' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Genius notes aren’t available here right now.')
    await user.click(screen.getByRole('button', { name: 'Back to lyrics' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'This Modern Love' })).toBeVisible())
    expect(screen.getByText('[Licensed lyrics are not loaded in this preview.]')).toBeVisible()
  })

  it('keeps focus mode lyrics-only', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: /This Modern Love/ }))
    await user.click(screen.getByRole('button', { name: 'Focus reading' }))

    expect(screen.queryByRole('tab', { name: 'Comments' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This Modern Love' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Exit focus' }))
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeInTheDocument()
  })

  it('implements keyboard navigation for the reader tabs', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
      comments: [{ id: '1', body: 'A keyboard-opened note.', author: 'Mina' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()

    await user.click(await screen.findByRole('button', { name: /This Modern Love/ }))
    const lyricsTab = screen.getByRole('tab', { name: 'Lyrics' })
    const commentsTab = screen.getByRole('tab', { name: 'Comments' })

    expect(lyricsTab).toHaveAttribute('tabindex', '0')
    expect(commentsTab).toHaveAttribute('tabindex', '-1')
    lyricsTab.focus()
    await user.keyboard('{ArrowRight}')

    expect(commentsTab).toHaveFocus()
    expect(commentsTab).toHaveAttribute('aria-selected', 'true')
    expect(commentsTab).toHaveAttribute('tabindex', '0')
    expect(await screen.findByText('A keyboard-opened note.')).toBeVisible()

    await user.keyboard('{Home}')
    expect(lyricsTab).toHaveFocus()
    expect(lyricsTab).toHaveAttribute('aria-selected', 'true')
  })
})
