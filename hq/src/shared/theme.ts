import { THEME_STORAGE_KEY, type Theme } from './themeInit'

export { THEME_STORAGE_KEY, type Theme } from './themeInit'

export function getStoredTheme(): Theme {
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

// Applies a stored dark choice before the app first renders. Light is the default and needs no attribute.
// Not a script in the page head: Wasp server-renders the head, and an inline script there fails hydration.
export function initTheme(): void {
  if (getStoredTheme() === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
}
