// Whether the menu is folded to icons, remembered in this browser.
const KEY = 'menuCollapsed'

export function storedCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

export function storeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, String(collapsed))
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}
