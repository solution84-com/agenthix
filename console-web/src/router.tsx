/**
 * The screens' addresses: plain paths in the browser's history. The server answers every path without a file
 * extension with the app (console/src/http/web.ts), so a reload or a pasted address lands on the same screen.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}): void {
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  for (const listener of [...listeners]) listener()
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/** One parameter of the address's query, such as the open panel (`?panel=notices`); null when absent. */
export function useSearchParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return new URLSearchParams(search).get(name)
}

/** Sets or drops one query parameter in place: on the same page, with no new history entry. */
export function setSearchParam(name: string, value: string | null): void {
  setSearchParams({ [name]: value })
}

/** Sets or drops several query parameters at once, in place: a null drops one. */
export function setSearchParams(values: Record<string, string | null>): void {
  const params = new URLSearchParams(window.location.search)
  for (const [name, value] of Object.entries(values)) {
    if (value === null) params.delete(name)
    else params.set(name, value)
  }
  const query = params.toString()
  navigate(`${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`, { replace: true })
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
}

/** A link inside the app: a real `<a>` (it opens in a new tab as one), followed without reloading the page. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const follow = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={follow} {...rest} />
}
