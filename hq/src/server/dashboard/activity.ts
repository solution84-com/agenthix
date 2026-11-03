import type { DashboardSnapshotActivity, DashboardSnapshotActivityType } from '@agenthix/core'
import { randomUUID } from 'node:crypto'

export const MAX_ENTRIES = 30

/**
 * Nothing reads this ring since the dashboard's live feed went; its callers still record to it until they are
 * taken out with it.
 *
 * `projectId` is server-side only — deliberately never added to the core
 * `DashboardSnapshotActivity` type, since the browser has no use for it and
 * adding it there would be a protocol change. It exists so a reader
 * can tell which entries name a project (project_created, task_closed) and
 * filter those down to viewers entitled to that project before anything is
 * stripped and sent to a client (spec §6.4).
 */
export type InternalActivityEntry = DashboardSnapshotActivity & { projectId?: string }

const ring: InternalActivityEntry[] = []

export function recordActivity(
  type: DashboardSnapshotActivityType,
  summary: string,
  relatedId?: string,
  projectId?: string,
): void {
  ring.unshift({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    summary,
    relatedId,
    projectId,
  })
  if (ring.length > MAX_ENTRIES) ring.length = MAX_ENTRIES
}

/**
 * The full ring, newest first, `projectId` included. This module does no
 * filtering and no DB work: a reader must filter it to the viewer's projects
 * before anything is sent.
 */
export function readRecentActivity(): InternalActivityEntry[] {
  return [...ring]
}

export function __resetForTests(): void {
  ring.length = 0
}
