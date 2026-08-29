import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '../theme'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('exposes all preferences and reports the selected state', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.themePreference).toBe('dark')
  })
})
