/**
 * What hq knows about each site, read once for the Execution Sites list, a
 * site's page and the site notifications: its row, its projects, what waits
 * for it, and its last health report.
 */
import { prisma } from 'wasp/server'
import { parseSiteHealth } from '@agenthix/core'
import { HELD_FOR_RECONNECT_REASON, WAITING_FOR_SLOT_REASON } from '../agents/taskExecutionReasons'
import { tasksRunOnSite } from '../projects/personalProject'
import type { StandingInput } from './siteStanding'

export const SITE_FACTS_SELECT = {
  id: true, siteId: true, label: true, status: true, protocolVersion: true, siteUrl: true,
  isDefault: true, registeredAt: true, lastSeenAt: true, createdById: true,
  health: true, healthReportedAt: true, revokedAt: true, revokedById: true, leftByItself: true, cloudMachineId: true,
  _count: { select: { projects: true } },
} as const

export type SiteFacts = StandingInput & {
  id: string
  siteId: string
  label: string
  siteUrl: string | null
  createdById: string | null
  healthReportedAt: Date | null
  revokedAt: Date | null
  revokedById: string | null
  leftByItself: boolean
  cloudMachineId: string | null
}

/**
 * What waits for a site: tasks held until it reconnects (runs), instructions
 * it has not yet acknowledged (changes to reach it), and runs it has started
 * that wait for one of its places (at capacity).
 */
async function waitingFor(siteIds: string[]): Promise<Map<string, { runs: number; changes: number; atCapacity: number }>> {
  const [runs, atCapacity, changes] = await Promise.all([
    Promise.all(siteIds.map(siteId => prisma.task.count({
      where: { AND: [tasksRunOnSite(siteId), { runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON }] },
    }))),
    Promise.all(siteIds.map(siteId => prisma.task.count({
      where: { AND: [tasksRunOnSite(siteId), { runState: 'RUN_ACTIVE', runStateReason: WAITING_FOR_SLOT_REASON }] },
    }))),
    prisma.heldSiteInstruction.groupBy({
      by: ['siteId'],
      where: { siteId: { in: siteIds }, acknowledgedAt: null },
      _count: { _all: true },
    }),
  ])
  const changesBySite = new Map(changes.map(c => [c.siteId, c._count._all]))
  return new Map(siteIds.map((siteId, i) => [siteId, { runs: runs[i], changes: changesBySite.get(siteId) ?? 0, atCapacity: atCapacity[i] }]))
}

export async function readSiteFacts(where: { id?: string } = {}): Promise<SiteFacts[]> {
  const rows = await prisma.executionSite.findMany({ where, select: SITE_FACTS_SELECT, orderBy: { registeredAt: 'asc' } })
  const waiting = await waitingFor(rows.map(r => r.siteId))
  return rows.map(({ _count, health, ...row }) => ({
    ...row,
    health: parseSiteHealth(health),
    revoked: row.status === 'REVOKED',
    projectCount: _count.projects,
    waiting: waiting.get(row.siteId) ?? { runs: 0, changes: 0, atCapacity: 0 },
  }))
}
