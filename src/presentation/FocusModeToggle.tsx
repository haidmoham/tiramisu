export interface FocusModeToggleProps {
  isFocused: boolean
  onToggle: (isFocused: boolean) => void
}

export function FocusModeToggle({ isFocused, onToggle }: FocusModeToggleProps) {
  return (
    <button
      type="button"
      className="focus-mode-toggle"
      aria-pressed={isFocused}
      onClick={() => onToggle(!isFocused)}
    >
      <span className="focus-mode-toggle__mark" aria-hidden="true">
        {isFocused ? '−' : '+'}
      </span>
      <span>{isFocused ? 'Exit focus' : 'Focus reading'}</span>
    </button>
  )
}
