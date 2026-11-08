/**
 * Wakes the scheduler now rather than at the next minute — called wherever a
 * run ends or a routine changes, so what a run's end concerns is seen
 * promptly. Kept free of imports
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
