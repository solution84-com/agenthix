import { useSyncExternalStore } from 'react'

/**
 * HQ suspended now from *Plan maintenance*, remembered for this tab. The Fleet Console reaches HQ's machine through
 * HQ, so once HQ stops its figures cannot say so: HQ's page reads it from here, as it reads its own Suspend.
 */
let suspendedAt: string | null = null
const listeners = new Set<() => void>()

export function noteHqSuspended(at: string): void {
  if (suspendedAt === at) return
  suspendedAt = at
  for (const l of [...listeners]) l()
}

export function forgetHqSuspended(): void {
  if (suspendedAt === null) return
  suspendedAt = null
  for (const l of [...listeners]) l()
}

export function useHqSuspended(): string | null {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => suspendedAt)
}
