// The light/dark choice, remembered in this browser. public/theme-init.js applies it before the first paint and
// reads the same key.
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}
