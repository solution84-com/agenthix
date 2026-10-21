import { randomBytes } from 'node:crypto'

/**
 * The one-time state that ties a GitHub App registration to an admin who started it
 * inside hq. GitHub hands the state back on the redirect, so a callback that arrives
 * without one hq issued, or with one already used or expired, is refused. Held in
 * memory: an hq restart mid-registration just means starting again.
 */
export const MANIFEST_STATE_TTL_MS = 10 * 60 * 1000

type Entry = { userId: string; expiresAt: number }
const pending = new Map<string, Entry>()

function sweepExpired(now: number): void {
  for (const [state, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(state)
  }
}

export function issueManifestState(userId: string, now: number = Date.now()): string {
  sweepExpired(now)
  const state = randomBytes(32).toString('base64url')
  pending.set(state, { userId, expiresAt: now + MANIFEST_STATE_TTL_MS })
  return state
}

/** Whether the state is one hq issued that is neither used nor expired. Does not use it up. */
export function isManifestStateOpen(state: unknown, now: number = Date.now()): boolean {
  sweepExpired(now)
  return typeof state === 'string' && pending.has(state)
}

/** Uses the state up: a second call with the same value gets null. */
export function consumeManifestState(state: unknown, now: number = Date.now()): { userId: string } | null {
  sweepExpired(now)
  if (typeof state !== 'string') return null
  const entry = pending.get(state)
  if (!entry) return null
  pending.delete(state)
  return { userId: entry.userId }
}

export function clearManifestStates(): void {
  pending.clear()
}
