export const THEME_PREFERENCE_STORAGE_KEY = 'tiramisu-theme-preference'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const RESOLVED_THEMES = ['light', 'dark'] as const
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number]

/** Colors used by the browser UI (and the address-bar theme-color metadata). */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f4eedf',
  dark: '#160f18',
}

export interface ThemeEnvironment {
  document?: Document
  window?: Pick<Window, 'localStorage' | 'matchMedia'>
}

function browserEnvironment(): ThemeEnvironment {
  if (typeof document === 'undefined' || typeof window === 'undefined') return {}
  return { document, window }
}

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function normalizeThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' && isThemePreference(value) ? value : 'system'
}

function getStorage(environment: ThemeEnvironment): Storage | null {
  try {
    return environment.window?.localStorage ?? null
  } catch {
    return null
  }
}

/** Reads a saved explicit preference, falling back to the system preference. */
export function readThemePreference(environment: ThemeEnvironment = browserEnvironment()): ThemePreference {
  const storage = getStorage(environment)
  if (!storage) return 'system'

  try {
    const stored = storage.getItem(THEME_PREFERENCE_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function systemTheme(environment: ThemeEnvironment = browserEnvironment()): ResolvedTheme {
  try {
    return environment.window?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function resolveTheme(
  preference: ThemePreference,
  environment: ThemeEnvironment = browserEnvironment(),
): ResolvedTheme {
  const normalizedPreference = normalizeThemePreference(preference)
  return normalizedPreference === 'system' ? systemTheme(environment) : normalizedPreference
}

/**
 * Applies the complete theme state to the document. This is intentionally
 * safe to call before React mounts and when browser storage is unavailable.
 */
export function applyTheme(
  preference: ThemePreference,
  environment: ThemeEnvironment = browserEnvironment(),
): ResolvedTheme {
  const normalizedPreference = normalizeThemePreference(preference)
  const resolved = resolveTheme(normalizedPreference, environment)
  const ownerDocument = environment.document
  const root = ownerDocument?.documentElement
  if (!root) return resolved

  root.dataset.theme = resolved
  root.dataset.themePreference = normalizedPreference
  root.style.colorScheme = resolved

  let themeColor = ownerDocument.querySelector('meta[name="theme-color"]')
  if (!themeColor && ownerDocument.head) {
    themeColor = ownerDocument.createElement('meta')
    themeColor.setAttribute('name', 'theme-color')
    ownerDocument.head.append(themeColor)
  }
  themeColor?.setAttribute('content', THEME_COLORS[resolved])

  return resolved
}

/** Persists only explicit light/dark choices; system remains a live default. */
export function persistThemePreference(
  preference: ThemePreference,
  environment: ThemeEnvironment = browserEnvironment(),
): void {
  const normalizedPreference = normalizeThemePreference(preference)
  const storage = getStorage(environment)
  if (!storage) return

  try {
    if (normalizedPreference === 'system') {
      storage.removeItem(THEME_PREFERENCE_STORAGE_KEY)
    } else {
      storage.setItem(THEME_PREFERENCE_STORAGE_KEY, normalizedPreference)
    }
  } catch {
    // Privacy mode, disabled storage, and quota errors should not break the UI.
  }
}
