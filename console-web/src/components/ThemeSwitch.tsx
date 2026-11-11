import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '@agenthix/ui/primitives'
import { applyTheme, storedTheme, type Theme } from '../theme'

const CHOICES = [
  { value: 'light' as const, label: 'Light', icon: <Sun size={14} aria-hidden /> },
  { value: 'dark' as const, label: 'Dark', icon: <Moon size={14} aria-hidden /> },
]

/** Light or dark, remembered in this browser. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const choose = (next: Theme) => { applyTheme(next); setTheme(next) }
  return <SegmentedControl label="Theme" value={theme} onChange={choose} options={CHOICES} />
}
