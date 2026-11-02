/**
 * The apps known on a workspace, for *Start* on a live preview's strip (live preview spec section 4, *The app*): each
 * app name once, as the branch's own record when it has one, else as it was last started on another branch of the
 * workspace, so `main`'s live preview offers the apps last started on any branch.
 */
import { prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import type { StartableAppView } from './types'

/** More apps than any workspace has: the list read for *Start* stops there. */
const KNOWN_APPS_READ = 500
const LIVE_APP_STATES = ['starting', 'running', 'paused']

type Known = LiveApp & { runs: { startedAt: Date }[] }

const lastStarted = (a: Known): number => (a.runs[0]?.startedAt ?? a.updatedAt).getTime()

/** Each app name known on the workspace once: the branch's own record, else the one last started on another branch. */
export async function knownApps(row: Pick<LivePreview, 'workspaceId' | 'branch'>): Promise<Known[]> {
  const all: Known[] = await prisma.liveApp.findMany({
    where: { workspaceId: row.workspaceId },
    include: { runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } } },
    orderBy: { updatedAt: 'desc' },
    take: KNOWN_APPS_READ,
  })
  const byName = new Map<string, Known>()
  for (const a of all) {
    const held = byName.get(a.name)
    if (!held || (held.branch !== row.branch && (a.branch === row.branch || lastStarted(a) > lastStarted(held)))) byName.set(a.name, a)
  }
  return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name))
}

/** What the strip offers to start: every known app not already going in this live preview. */
export async function startableApps(row: Pick<LivePreview, 'id' | 'workspaceId' | 'branch'>): Promise<StartableAppView[]> {
  return (await knownApps(row))
    .filter(a => !(a.branch === row.branch && a.livePreviewId === row.id && LIVE_APP_STATES.includes(a.state)))
    .map(a => ({ name: a.name, folder: a.folder, command: a.command, port: a.port, fromBranch: a.branch === row.branch ? null : a.branch }))
}

