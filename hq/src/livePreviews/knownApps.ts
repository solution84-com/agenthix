/**
 * The apps known for a live preview, for *Start* on its strip and the app a person's start opens with (live preview
 * spec section 4, *The app*):
 *
 * - **On a branch:** the apps started on that branch, and only those.
 * - **On `main`:** each app name once, as it was last started on any branch of the workspace, since no agent works on
 *   `main` to start one.
 *
 * Two names for the one app (the same folder and port, which cannot both run in one container) show once: the one
 * going here, else the one started last.
 */
import { prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import type { StartableAppView } from './types'

/** More apps than any workspace has: the list read for *Start* stops there. */
const KNOWN_APPS_READ = 500
const LIVE_APP_STATES = ['starting', 'running', 'paused']

type Known = LiveApp & { runs: { startedAt: Date }[] }
type Row = Pick<LivePreview, 'id' | 'workspaceId' | 'branch' | 'onMain'>

const lastStarted = (a: Known): number => (a.runs[0]?.startedAt ?? a.updatedAt).getTime()
const goingIn = (a: Known, row: Pick<LivePreview, 'id' | 'branch'>): boolean =>
  a.branch === row.branch && a.livePreviewId === row.id && LIVE_APP_STATES.includes(a.state)

/** Whether `a` is kept over `b`, of two records for one app. */
function before(a: Known, b: Known, row: Row): boolean {
  if (goingIn(a, row) !== goingIn(b, row)) return goingIn(a, row)
  if (a.branch === row.branch && b.branch !== row.branch) return true
  if (b.branch === row.branch && a.branch !== row.branch) return false
  return lastStarted(a) > lastStarted(b)
}

function onceBy(apps: Known[], key: (a: Known) => string, row: Row): Known[] {
  const kept = new Map<string, Known>()
  for (const a of apps) {
    const held = kept.get(key(a))
    if (!held || before(a, held, row)) kept.set(key(a), a)
  }
  return [...kept.values()]
}

/** The apps known for this live preview, each once, by name. */
export async function knownApps(row: Row): Promise<Known[]> {
  const all: Known[] = await prisma.liveApp.findMany({
    where: row.onMain ? { workspaceId: row.workspaceId } : { workspaceId: row.workspaceId, branch: row.branch },
    include: { runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } } },
    orderBy: { updatedAt: 'desc' },
    take: KNOWN_APPS_READ,
  })
  const byName = onceBy(all, a => a.name, row)
  return onceBy(byName, a => `${a.folder}\u0000${a.port}`, row).sort((x, y) => x.name.localeCompare(y.name))
}

/** What the strip offers to start: every known app not already going in this live preview. */
export async function startableApps(row: Row): Promise<StartableAppView[]> {
  return (await knownApps(row))
    .filter(a => !goingIn(a, row))
    .map(a => ({ name: a.name, folder: a.folder, command: a.command, port: a.port, fromBranch: a.branch === row.branch ? null : a.branch }))
}

/** The app a person's *Start live preview* starts with it: the known app started last, if there is one. */
export async function appToOpenWith(row: Row): Promise<Known | null> {
  const known = await knownApps(row)
  return known.reduce<Known | null>((best, a) => (!best || lastStarted(a) > lastStarted(best) ? a : best), null)
}
