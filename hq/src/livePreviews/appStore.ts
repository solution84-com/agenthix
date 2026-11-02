/**
 * hq's record of live apps (core's `livePreview/apps.ts`): an app is recorded the first time it starts on a branch,
 * keeping its id (its address's) for good, so it stays the same across restarts and two branches each running `web`
 * keep separate addresses. Each run is kept with who started it, when, how it ended and its last lines. What a site
 * says about an app (its state, its sentence, its output) is read field by field, cut short and cleaned before it is
 * kept; its name, folder, command and port stay hq's.
 */
import { prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import {
  APP_RUN_ENDINGS, APP_STATES, lastOutputLines, newAppId, type AppRunEnding, type AppSpec, type AppState,
} from '@agenthix/core'
import { emitLivePreviewChange } from './socket'

/** More named apps than any branch needs; recording another past it is refused. */
export const APPS_PER_BRANCH = 50
const DETAIL_CHARS = 500

export type AppSeen = { state: AppState; since: Date; detail: string | null; lastLines: string[] }

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

export function cleanDetail(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.replace(CONTROL, '').slice(0, DETAIL_CHARS) : null
}

export function readLines(v: unknown): string[] {
  return Array.isArray(v) ? lastOutputLines(v.filter((l): l is string => typeof l === 'string').join('\n')) : []
}

const asDate = (v: unknown): Date | null => {
  const d = typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** A state the site told, read field by field; null when it is not one. */
export function readAppSeen(v: unknown): AppSeen | null {
  const a = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  const state = APP_STATES.find(s => s === a?.state)
  const since = asDate(a?.since)
  if (!a || !state || !since) return null
  return { state, since, detail: cleanDetail(a.detail), lastLines: readLines(a.lastLines) }
}

const readEnding = (v: unknown): AppRunEnding | null => APP_RUN_ENDINGS.find(e => e === v) ?? null

/** The branch's app of this name, recorded now if it is not yet; `created` when it was. Null past the limit. */
export async function recordApp(
  workspaceId: string, branch: string, spec: Omit<AppSpec, 'appId'>,
): Promise<{ app: LiveApp; created: boolean } | null> {
  const key = { workspaceId_branch_name: { workspaceId, branch, name: spec.name } }
  const found = await prisma.liveApp.findUnique({ where: key })
  if (found) return { app: found, created: false }
  if (await prisma.liveApp.count({ where: { workspaceId, branch } }) >= APPS_PER_BRANCH) return null
  try {
    return { app: await prisma.liveApp.create({ data: { id: newAppId(), workspaceId, branch, ...spec } }), created: true }
  } catch {
    // Recorded at the same moment by another start: that record stands.
    const again = await prisma.liveApp.findUnique({ where: key })
    return again ? { app: again, created: false } : null
  }
}

export async function appNamed(workspaceId: string, branch: string, name: unknown): Promise<LiveApp | null> {
  if (typeof name !== 'string' || name.length > 64) return null
  return prisma.liveApp.findUnique({ where: { workspaceId_branch_name: { workspaceId, branch, name: name.trim() } } })
}

/** Keeps what the site told of the app, in this live preview, and tells the workspace's screens. */
export async function keepAppSeen(app: LiveApp, row: Pick<LivePreview, 'id' | 'workspaceId' | 'branchId'>, seen: AppSeen): Promise<void> {
  await prisma.liveApp.update({
    where: { id: app.id },
    data: { state: seen.state, since: seen.since, detail: seen.detail, lastLines: seen.lastLines, livePreviewId: row.id },
  })
  emitLivePreviewChange(row, 'apps')
}

export async function recordRunStart(r: {
  app: LiveApp; livePreviewId: string; userId: string; startedAt: Date; agentId: string | null; runId: string | null
}): Promise<void> {
  await prisma.liveAppRun.upsert({
    where: { appId_startedAt: { appId: r.app.id, startedAt: r.startedAt } },
    create: { appId: r.app.id, livePreviewId: r.livePreviewId, userId: r.userId, agentId: r.agentId, runId: r.runId, startedAt: r.startedAt },
    update: {},
  })
}

/**
 * `livePreview.appState`: an app of this live preview changed, and the run that ended when one did. Counts only for an
 * app hq recorded on the live preview's workspace and branch. False when it does not.
 */
export async function keepAppState(row: LivePreview, app: unknown, run: unknown): Promise<boolean> {
  const a = app && typeof app === 'object' ? (app as Record<string, unknown>) : null
  const appId = typeof a?.appId === 'string' && a.appId.length <= 64 ? a.appId : null
  const seen = readAppSeen(a)
  const recorded = appId ? await prisma.liveApp.findUnique({ where: { id: appId } }) : null
  if (!seen || !recorded || recorded.workspaceId !== row.workspaceId || recorded.branch !== row.branch) return false
  await keepAppSeen(recorded, row, seen)
  const r = run && typeof run === 'object' ? (run as Record<string, unknown>) : null
  if (!r || r.appId !== recorded.id || r.livePreviewId !== row.id) return true
  const startedAt = asDate(r.startedAt), endedAt = asDate(r.endedAt), ending = readEnding(r.ending)
  if (!startedAt || !endedAt || !ending) return true
  await prisma.liveAppRun.upsert({
    where: { appId_startedAt: { appId: recorded.id, startedAt } },
    create: { appId: recorded.id, livePreviewId: row.id, userId: row.userId, startedAt, endedAt, ending, lastLines: readLines(r.lastLines) },
    update: { endedAt, ending, lastLines: readLines(r.lastLines) },
  })
  return true
}
