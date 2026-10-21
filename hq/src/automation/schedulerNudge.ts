/**
 * Wakes the scheduler now rather than at the next minute — called wherever a
 * task becomes queued or a run ends, so a quiet boundary's pulse fires on the
 * leading edge and a finished round is closed promptly. Kept free of imports
 * so any module can call it without joining an import cycle; it does nothing
 * until the scheduler has started (and so nothing in unit tests).
 */
let wake: (() => void) | null = null

export function setSchedulerWake(fn: (() => void) | null): void {
  wake = fn
}

export function nudgeScheduler(): void {
  wake?.()
}
