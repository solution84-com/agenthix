import { useCallback, useSyncExternalStore } from 'react'

/** What the foot's Pinned row keeps in the browser: whether its list is open and the pins used, latest first. */
export interface PinnedMemory {
  open: boolean
  recent: string[]
}

const KEY = 'pinnedFoot'
const RECENT_KEPT = 8
const EMPTY: PinnedMemory = { open: false, recent: [] }

function parse(raw: string | null): PinnedMemory {
  if (!raw) return EMPTY
  try {
    const v = JSON.parse(raw) as Partial<PinnedMemory>
    const recent = Array.isArray(v.recent) ? v.recent.filter((id): id is string => typeof id === 'string') : []
    return { open: v.open === true, recent }
  } catch { return EMPTY }
}

// Two foots can be on screen at once (the panel's and *Go to*'s), so they share one store.
let snapshot: { raw: string | null; value: PinnedMemory } = { raw: null, value: EMPTY }
let fallback: PinnedMemory = EMPTY
const listeners = new Set<() => void>()

function getSnapshot(): PinnedMemory {
  let raw: string | null
  try { raw = localStorage.getItem(KEY) } catch { return fallback }
  if (raw !== snapshot.raw) snapshot = { raw, value: parse(raw) }
  return snapshot.value
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function write(next: PinnedMemory) {
  fallback = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable: kept for this page only */ }
  listeners.forEach((l) => l())
}

export function usePinnedMemory() {
  const memory = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  const setOpen = useCallback((open: boolean) => write({ ...getSnapshot(), open }), [])
  const used = useCallback((id: string) => {
    const now = getSnapshot()
    write({ ...now, recent: [id, ...now.recent.filter((r) => r !== id)].slice(0, RECENT_KEPT) })
  }, [])
  return { ...memory, setOpen, used }
}
