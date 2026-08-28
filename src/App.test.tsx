import { render, screen } from '@testing-library/react'
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
})
