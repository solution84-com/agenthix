import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, storedTheme, type Theme } from '../theme'

const CHOICES: { theme: Theme; label: string; Icon: typeof Sun }[] = [
  { theme: 'light', label: 'Light', Icon: Sun },
  { theme: 'dark', label: 'Dark', Icon: Moon },
]

/** Light or dark, remembered in this browser. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const choose = (next: Theme) => { applyTheme(next); setTheme(next) }
  return (
    <div role="group" aria-label="Theme" className="inline-flex gap-0.5 rounded-[9px] border border-border bg-surface-1 p-0.5">
      {CHOICES.map(({ theme: t, label, Icon }) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => choose(t)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-small ${theme === t ? 'bg-selected font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
        >
          <Icon size={14} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
