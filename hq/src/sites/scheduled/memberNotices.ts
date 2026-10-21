/**
 * The scheduled changes a signed-in person is told of on screen (host-management spec §14): on each project of theirs
 * that runs where the change is, or on Home for a change to hq itself. Only what is ahead or going, and only the
 * kinds that pause runs for a while; never who scheduled it. The notifications (`scheduledChanges.ts`) are the
 * record; this is the notice the page shows until it is over or dismissed.
 */
import { prisma } from 'wasp/server'
import type { ScheduledChangeKind } from '@agenthix/core'
import { holdEnds } from './runHold'
import { projectsOnSite } from './scheduledChanges'

const OPEN = ['scheduled', 'pausing', 'running']
const PAUSING_KINDS: ScheduledChangeKind[] = ['upgrade', 'resize', 'restore', 'move']

export type MemberNotice = {
  /** The change and the time it was told for, so a new time is a new notice that was not dismissed. */
  key: string
  kind: ScheduledChangeKind
  /** The site's name; null for a change to hq itself, which everyone is told of. */
  siteName: string | null
  at: Date
  expectedMinutes: number | null
  detail: string | null
  told: Date
  /** When the time was last changed; null when it never was. */
  moved: Date | null
  /** Keys of the person's projects that run where the change is; empty for a change to hq itself. */
  projectKeys: string[]
}

export async function scheduledNoticesFor(userId: string, now = new Date()): Promise<MemberNotice[]> {
  const rows = (await prisma.scheduledChange.findMany({
    where: { state: { in: OPEN }, kind: { in: PAUSING_KINDS } }, orderBy: { at: 'asc' }, include: { site: { select: { label: true } } },
  })).filter(r => now.getTime() <= holdEnds(r))
  const out: MemberNotice[] = []
  for (const row of rows) {
    let projectKeys: string[] = []
    if (row.siteId) {
      const mine = await prisma.projectMember.findMany({
        where: { userId, project: { AND: [projectsOnSite(row.siteId), { personalOwnerId: null }] } },
        select: { project: { select: { key: true } } },
      })
      if (mine.length === 0) continue
      projectKeys = mine.map(m => m.project.key)
    }
    out.push({
      key: `${row.id}:${row.at.toISOString()}`, kind: row.kind as ScheduledChangeKind, siteName: row.siteId ? row.site?.label ?? 'its site' : null,
      at: row.at, expectedMinutes: row.expectedMinutes, detail: row.detail, told: row.createdAt,
      moved: row.lastUpdate === 'changed' ? row.updatedAt : null, projectKeys,
    })
  }
  return out
}
