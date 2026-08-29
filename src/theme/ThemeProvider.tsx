import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeContext } from './ThemeContext'
import type { ThemeContextValue } from './ThemeContext'
import {
  applyTheme,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme'

export interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference())
  const [systemResolvedTheme, setSystemResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme('system'))
  const resolvedTheme = preference === 'system' ? systemResolvedTheme : preference

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    // Apply synchronously so controls and browser chrome track the click in
    // the same turn, then let React publish the state to both toggle mounts.
    const nextResolvedTheme = applyTheme(nextPreference)
    persistThemePreference(nextPreference)
    setPreferenceState(nextPreference)
    if (nextPreference === 'system') setSystemResolvedTheme(nextResolvedTheme)
  }, [])

  useLayoutEffect(() => {
    applyTheme(preference)

    if (preference !== 'system' || typeof window === 'undefined') return undefined

    let mediaQuery: MediaQueryList
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return undefined
    }

    const handleChange = () => {
      const nextTheme = applyTheme('system')
      setSystemResolvedTheme(nextTheme)
    }

    mediaQuery.addEventListener?.('change', handleChange)
    // Safari versions predating addEventListener expose the old API only.
    if (!mediaQuery.addEventListener) mediaQuery.addListener?.(handleChange)

    return () => {
      mediaQuery.removeEventListener?.('change', handleChange)
      if (!mediaQuery.removeEventListener) mediaQuery.removeListener?.(handleChange)
    }
  }, [preference])

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
