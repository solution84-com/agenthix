/**
 * Tells everyone with a socket open that what needs them may have changed (`needsYou:changed`), at most once per
 * `DEBOUNCE_MS` however many changes ask: a client reads its own list again. The name is kept from when this also
 * pushed the dashboard's snapshot, which no screen reads any more; its many callers still say when work changed.
 */
import { connectedPeople, emitToPeople, PERSON_EVENTS } from '../personEvents'

const DEBOUNCE_MS = 500

let pending: ReturnType<typeof setTimeout> | null = null

function flush(): void {
  pending = null
  emitToPeople(connectedPeople(), PERSON_EVENTS.needsYouChanged)
}

export function triggerSnapshotPush(): void {
  if (pending) return
  pending = setTimeout(flush, DEBOUNCE_MS)
}

export function __resetForTests(): void {
  if (pending) { clearTimeout(pending); pending = null }
}
