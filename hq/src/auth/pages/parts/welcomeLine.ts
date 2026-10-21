const KEY = 'agenthix:welcome-line'

/** A person who just joined through an invitation is welcomed once, in the first project they land in. */
export function rememberWelcome(name: string, store: Pick<Storage, 'setItem'> = window.sessionStorage): void {
  try { store.setItem(KEY, name) } catch { /* storage refused: no welcome line */ }
}

export function peekWelcome(store: Pick<Storage, 'getItem'> = window.sessionStorage): string | null {
  try { return store.getItem(KEY) } catch { return null }
}

export function clearWelcome(store: Pick<Storage, 'removeItem'> = window.sessionStorage): void {
  try { store.removeItem(KEY) } catch { /* nothing kept */ }
}
