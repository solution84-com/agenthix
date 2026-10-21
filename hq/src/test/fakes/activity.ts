import { vi } from 'vitest'
import type * as Real from '../../server/dashboard/activity'
import { resetBeforeEachTest, type MissingFrom, type Spy } from './lifecycle'

export const MAX_ENTRIES = 30

export type InternalActivityEntry = Real.InternalActivityEntry

let entries: InternalActivityEntry[] = []
let nextId = 0

/** Records an entry, newest first, as the real feed does (ids and timestamps are deterministic). */
export const recordActivity: Spy<typeof Real.recordActivity> = vi.fn(addEntry)

function addEntry(type: Parameters<typeof Real.recordActivity>[0], summary: string, relatedId?: string, projectId?: string): void {
  entries.unshift({ id: `activity-${++nextId}`, timestamp: new Date().toISOString(), type, summary, relatedId, projectId })
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
}

export const readRecentActivity: Spy<typeof Real.readRecentActivity> = vi.fn(() => [...entries])

export function __resetForTests(): void {
  entries = []
}

/** Replace the feed with these entries, newest first. */
export function seedActivity(seeded: InternalActivityEntry[]): void {
  entries = [...seeded]
}

export function reset(): void {
  entries = []
  nextId = 0
  recordActivity.mockReset()
  readRecentActivity.mockReset()
}

resetBeforeEachTest(reset)

export const _exportsEveryRealName: MissingFrom<typeof Real, typeof import('./activity')> extends never ? true : never = true
