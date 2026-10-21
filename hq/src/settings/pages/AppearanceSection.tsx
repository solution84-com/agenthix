import { useState } from 'react'
import { applyTheme, getStoredTheme, type Theme } from '../../shared/theme'

const OPTIONS: { value: Theme; label: string; desc: string }[] = [
  { value: 'light', label: 'Light', desc: 'The default.' },
  { value: 'dark', label: 'Dark', desc: 'A dark interface, easier on the eyes at night.' },
]

export function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(opt => (
        <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="theme"
            value={opt.value}
            checked={theme === opt.value}
            onChange={() => choose(opt.value)}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="text-body text-text-primary">{opt.label}</span>
            <span className="block text-small text-text-secondary">{opt.desc}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
