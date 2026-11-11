import { useEffect, useSyncExternalStore } from 'react'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { apiRead, backgroundQuery, becauseOf } from '../../api/quietRead'
import type { FleetResponse } from './types'

export const REFRESH_MS = 15_000

export type FleetState =
  | { phase: 'loading' }
  | { phase: 'ready'; fleet: FleetResponse; readAt: Date }
  /** The last read failed; `fleet` is the last one that worked, if any. */
  | { phase: 'failed'; message: string; error: unknown; fleet: FleetResponse | null; readAt: Date | null }

// One read of the fleet shared by everything drawing it — the menu's sites and the page beside it — so the two never
// disagree and the Fleet Console is asked once.
const LOADING: FleetState = { phase: 'loading' }
let state: FleetState = LOADING
let last: { fleet: FleetResponse; readAt: Date } | null = null
let reading: Promise<void> | null = null
/** Bumped when the fleet is forgotten, so a read begun before is not taken afterwards. */
let generation = 0
/** Asked again while a read was under way: read once more after it, since that read may predate what changed. */
let again = false
let readers = 0
let timer: number | null = null
const listeners = new Set<() => void>()

function set(next: FleetState): void {
  state = next
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Reads the fleet now; a read already under way is not asked twice. */
function refresh(): void {
  if (reading) return
  const asked = generation
  const read: Promise<void> = apiRead<FleetResponse>('/fleet')
    .then(fleet => {
      if (asked !== generation) return
      last = { fleet, readAt: new Date() }
      set({ phase: 'ready', ...last })
    })
    .catch((err: unknown) => {
      if (asked !== generation) return
      set({ phase: 'failed', message: err instanceof Error ? err.message : String(err), error: err, fleet: last?.fleet ?? null, readAt: last?.readAt ?? null })
    })
    .finally(() => {
      if (reading !== read) return
      reading = null
      if (again) {
        again = false
        refresh()
      }
    })
  reading = read
}

/** What a screen calls after changing something: a read that began before the change is followed by another. */
function readAgain(): void {
  if (reading) again = true
  else refresh()
}

const onFocus = () => refresh()

function start(): void {
  if (readers++ > 0) return
  timer = window.setInterval(refresh, REFRESH_MS)
  window.addEventListener('focus', onFocus)
}

/** When nothing draws the fleet any more (signed out), it is forgotten. */
function stop(): void {
  if (--readers > 0) return
  if (timer !== null) window.clearInterval(timer)
  timer = null
  window.removeEventListener('focus', onFocus)
  generation++
  reading = null
  again = false
  state = LOADING
  last = null
}

/** The fleet, read when a screen that draws it opens, again every 15 seconds, and when the window comes back to the front. */
export function useFleet(): FleetState & { refresh: () => void } {
  const current = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    start()
    refresh()
    return stop
  }, [])
  return { ...current, refresh: readAgain }
}

/**
 * What a screen says of the fleet's read, quietly: nothing while it is retried or fresh; with no fleet yet,
 * `failedWithoutData` and the nudge go in place of the content; with a fleet held, the nudge is for the meta line once
 * it is over a minute old (two refreshes). Check `failedWithoutData` before drawing "nothing here".
 */
export function useFleetRead(state: FleetState & { refresh: () => void }, what: string) {
  const failed = state.phase === 'failed'
  return useBackgroundRead(backgroundQuery({
    data: state.phase === 'loading' ? undefined : state.fleet,
    error: failed ? state.error : null,
    readAt: state.phase === 'loading' ? null : state.readAt,
    refetch: state.refresh,
  }), { what, pollMs: REFRESH_MS, because: becauseOf })
}
