import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
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
  it('offers a keyboard bypass to the current route main landmark', async () => {
    renderApp()

    const skipLink = screen.getByRole('link', { name: 'skip to content' })
    const main = await screen.findByRole('main')

    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')

    main.focus()
    expect(main).toHaveFocus()
  })

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

describe('search identity and recovery', () => {
  it('keeps results attached to the submitted query while the draft changes', async () => {
    const user = userEvent.setup()
    renderApp()
    const input = await screen.findByRole('searchbox')
    await user.type(input, 'modern')
    await user.click(screen.getByRole('button', { name: /Look up/ }))
    await screen.findByRole('heading', { name: 'results for “modern”' })
    await user.clear(input)
    await user.type(input, 'something else')
    expect(screen.getByRole('status')).toHaveTextContent('match for “modern”')
    expect(screen.getByRole('heading', { name: 'results for “modern”' })).toBeVisible()
  })

  it('clears the failed query and mode when restoring the curated shelf', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.type(screen.getByRole('searchbox'), 'no such sheet')
    await user.click(screen.getByRole('radio', { name: 'Artist' }))
    await user.click(screen.getByRole('button', { name: /Look up/ }))
    await user.click(await screen.findByRole('button', { name: 'Show all' }))
    expect(await screen.findByText('3 lyric sheets')).toBeVisible()
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Smart' })).toBeChecked()
  })

  it('loads a bookmarked query and mode', async () => {
    renderApp('/?q=modern&by=title')
    expect(await screen.findByRole('button', { name: /This Modern Love/ })).toBeVisible()
    expect(screen.getByRole('searchbox')).toHaveValue('modern')
    expect(screen.getByRole('radio', { name: 'Title' })).toBeChecked()
  })

  it('retries the submitted search after an error', async () => {
    const user = userEvent.setup()
    const provider = new FixtureLyricsProvider({ latencyMs: 0 })
    const search = vi.spyOn(provider, 'search')
      .mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter initialEntries={['/?q=modern']}><App provider={provider} /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'try again' }))
    expect(await screen.findByRole('button', { name: /This Modern Love/ })).toBeVisible()
    expect(search).toHaveBeenLastCalledWith('modern', expect.any(AbortSignal), 'smart')
  })
})


describe('search request lifecycle', () => {
  it('loads the shelf under StrictMode after effect cleanup', async () => {
    render(<StrictMode><MemoryRouter><App provider={new FixtureLyricsProvider({ latencyMs: 0 })} /></MemoryRouter></StrictMode>)
    expect(await screen.findByText('3 lyric sheets')).toBeVisible()
  })

  it('allows a replacement search and ignores an older provider response', async () => {
    const user = userEvent.setup()
    const provider = new FixtureLyricsProvider({ latencyMs: 0 })
    const tracks = await provider.search('modern')
    let resolveOld: (value: typeof tracks) => void = () => {}
    vi.spyOn(provider, 'search').mockImplementation(async (query) => {
      if (query === 'old') return new Promise((resolve) => { resolveOld = resolve })
      return tracks
    })
    render(<MemoryRouter><App provider={provider} /></MemoryRouter>)
    await screen.findByRole('button', { name: /This Modern Love/ })
    const input = screen.getByRole('searchbox')
    await user.type(input, 'old')
    await user.click(screen.getByRole('button', { name: /Look up/ }))
    expect(screen.queryByRole('button', { name: /This Modern Love/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Look up/ })).toBeEnabled()
    await user.clear(input)
    await user.type(input, 'new')
    await user.click(screen.getByRole('button', { name: /Look up/ }))
    await screen.findByRole('button', { name: /This Modern Love/ })
    await act(async () => resolveOld([]))
    expect(screen.getByRole('status')).toHaveTextContent('1 match for “new”')
    expect(screen.getByRole('button', { name: /This Modern Love/ })).toBeVisible()
  })

  it('bounds a hung search and ignores success after the timeout', async () => {
    const provider = new FixtureLyricsProvider({ latencyMs: 0 })
    const tracks = await provider.search('modern')
    let resolveSearch: (value: typeof tracks) => void = () => {}
    vi.spyOn(provider, 'search').mockImplementation(() => new Promise((resolve) => { resolveSearch = resolve }))
    const originalSetTimeout = window.setTimeout.bind(window)
    let timeoutSearch: () => void = () => {}
    const timer = vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => {
      if (delay === 20_000 && typeof handler === 'function') timeoutSearch = handler as () => void
      return originalSetTimeout(handler, delay, ...args)
    })
    render(<MemoryRouter initialEntries={['/?q=modern']}><App provider={provider} /></MemoryRouter>)
    await act(async () => timeoutSearch())
    expect(screen.getByRole('alert')).toHaveTextContent('The search took too long')
    await act(async () => resolveSearch(tracks))
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('button', { name: /This Modern Love/ })).not.toBeInTheDocument()
    timer.mockRestore()
  })
})
