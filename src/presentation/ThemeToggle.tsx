import { useId } from 'react'
import { THEME_PREFERENCES, useTheme } from '../theme'
import type { ThemePreference } from '../theme'

const LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Somber',
  system: 'System',
}

export function ThemeToggle() {
  const { preference, resolvedTheme, setPreference } = useTheme()
  const id = useId()
  const groupName = `theme-preference-${id}`

  return (
    <fieldset
      className="theme-toggle"
      data-theme-preference={preference}
      data-theme-resolved={resolvedTheme}
    >
      <legend className="theme-toggle__legend">Theme</legend>
      <div className="theme-toggle__options" role="radiogroup" aria-label="Theme preference">
        {THEME_PREFERENCES.map((value) => {
          const label = LABELS[value]
          return (
            <label className="theme-toggle__option" key={value}>
              <input
                type="radio"
                name={groupName}
                value={value}
                aria-label={label}
                checked={preference === value}
                onChange={() => setPreference(value)}
              />
              <span>{label}</span>
            </label>
          )
        })}
      </div>
      <span className="theme-toggle__status sr-only" aria-live="polite">
        {preference === 'system'
          ? `System theme, currently ${resolvedTheme}.`
          : `${LABELS[preference]} theme selected.`}
      </span>
    </fieldset>
  )
}
