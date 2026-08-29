import { describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_COLORS,
  THEME_PREFERENCE_STORAGE_KEY,
} from './theme'

function environment(overrides: Partial<Window> = {}) {
  const document = window.document.implementation.createHTMLDocument('theme test')
  const localStorage = {
    getItem: vi.fn<(key: string) => string | null>().mockReturnValue(null),
    setItem: vi.fn<(key: string, value: string) => void>(),
    removeItem: vi.fn<(key: string) => void>(),
  }
  const browserWindow = {
    localStorage,
    matchMedia: vi.fn().mockReturnValue({ matches: false }),
    ...overrides,
  } as unknown as Window
  return { document, window: browserWindow, localStorage }
}

describe('theme state', () => {
  it('defaults invalid or unavailable stored values to system', () => {
    const invalid = environment()
    invalid.localStorage.getItem.mockReturnValue('sepia')
    expect(readThemePreference(invalid)).toBe('system')

    const unavailable = environment()
    unavailable.localStorage.getItem.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readThemePreference(unavailable)).toBe('system')
  })

  it('resolves system from matchMedia and applies document metadata', () => {
    const dark = environment()
    vi.mocked(dark.window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    expect(resolveTheme('system', dark)).toBe('dark')

    const resolved = applyTheme('system', dark)
    expect(resolved).toBe('dark')
    expect(dark.document.documentElement.dataset.theme).toBe('dark')
    expect(dark.document.documentElement.dataset.themePreference).toBe('system')
    expect(dark.document.documentElement.style.colorScheme).toBe('dark')
    expect(dark.document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))
      .toBe(THEME_COLORS.dark)
  })

  it('persists explicit choices and clears them when returning to system', () => {
    const env = environment()
    persistThemePreference('dark', env)
    expect(env.localStorage.setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'dark')

    persistThemePreference('system', env)
    expect(env.localStorage.removeItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY)
  })
})
