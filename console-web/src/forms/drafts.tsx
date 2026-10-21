import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

/**
 * What a person has chosen and typed in *Plan maintenance*, kept while the panel is open: changing which thing or
 * what to do swaps the form, and coming back to a form finds it as it was left — its fields, its time, and the
 * machine's answer, which may arrive while another form is shown. Closing the panel forgets it all.
 */
export class DraftStore {
  private values = new Map<string, unknown>()
  private listeners = new Set<() => void>()
  /** Whether what is kept here is still wanted: a command's answer is followed only while it is. */
  alive = true

  has(key: string): boolean { return this.values.has(key) }
  get(key: string): unknown { return this.values.get(key) }
  set(key: string, value: unknown): void {
    this.values.set(key, value)
    for (const listener of [...this.listeners]) listener()
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

type Scope = { store: DraftStore; prefix: string }
const DraftContext = createContext<Scope | null>(null)

/** The forms inside keep their drafts in `store`, under `prefix` (the thing and the kind chosen). */
export function DraftScope({ store, prefix, children }: { store: DraftStore; prefix: string; children: ReactNode }) {
  const scope = useMemo(() => ({ store, prefix }), [store, prefix])
  return <DraftContext.Provider value={scope}>{children}</DraftContext.Provider>
}

/** The panel's store, or, for a form drawn on its own, one of the form's own that lives as long as it does. */
function useScope(): Scope {
  const scope = useContext(DraftContext)
  const [own] = useState(() => new DraftStore())
  useEffect(() => {
    if (scope) return
    own.alive = true
    return () => { own.alive = false }
  }, [scope, own])
  return scope ?? { store: own, prefix: '' }
}

type SetDraft<T> = (next: T | ((prev: T) => T)) => void

/**
 * `useState`, kept in the panel's drafts. `shared` keeps one value for every form in the panel — *When* — rather
 * than one per thing and kind.
 */
export function useDraft<T>(name: string, initial: T, { shared = false }: { shared?: boolean } = {}): [T, SetDraft<T>] {
  const { store, prefix } = useScope()
  const key = shared ? `*:${name}` : `${prefix}:${name}`
  const [first] = useState(initial)
  const value = useSyncExternalStore(store.subscribe, () => (store.has(key) ? store.get(key) as T : first))
  const set = useCallback<SetDraft<T>>(next => {
    const prev = store.has(key) ? store.get(key) as T : first
    store.set(key, typeof next === 'function' ? (next as (prev: T) => T)(prev) : next)
  }, [store, key, first])
  return [value, set]
}

/** Whether the drafts are still wanted: while the panel is open, or the form drawn on its own is. */
export function useDraftsAlive(): () => boolean {
  const { store } = useScope()
  return useCallback(() => store.alive, [store])
}
