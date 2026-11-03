/**
 * Starting an app in a live preview, the one way both an agent's `start_app` and a person's *Start* on the strip take
 * (live preview spec section 4, *The app*): the app is recorded on the live preview's workspace and branch (its id, and
 * so its address, kept for good), the site is asked to start it, and a refusal forgets a record made for it. A site
 * that is silent or cannot answer throws `SiteSilent` or `SiteFailed`, for the caller to word.
 */
import { prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import { LIVE_PREVIEW_APP_METHODS, type AppSpec, type AppStatus, type LivePreviewAppRefused } from '@agenthix/core'
import { askSite } from './siteAsk'
import { APPS_PER_BRANCH, keepAppSeen, readAppSeen, recordApp, recordRunStart } from './appStore'
import { refusalWords } from './words'

export type StartingIn = { row: LivePreview; siteId: string; siteName: string; personId: string }
export type StartedBy = { agentId: string; runId: string } | null

export type AppStartOutcome =
  | { ok: true; app: LiveApp; status: AppStatus }
  | { ok: false; text: string }

export function refusedText(r: LivePreviewAppRefused, done: string): string {
  const problems = (r.problems ?? []).slice(0, 5).map(p => (typeof p?.message === 'string' ? p.message.slice(0, 300) : '')).filter(Boolean)
  return [r.detail.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500).trim(), ...problems, done].filter(Boolean).join(' ')
}

export async function startAppIn(at: StartingIn, spec: Omit<AppSpec, 'appId'>, startedBy: StartedBy): Promise<AppStartOutcome> {
  const recorded = await recordApp(at.row.workspaceId, at.row.branch, spec)
  if (!recorded) return { ok: false, text: `This branch already has ${APPS_PER_BRANCH} apps. Start one of them again by its name instead. Nothing was started.` }
  const { app, created } = recorded
  const forget = () => (created ? prisma.liveApp.delete({ where: { id: app.id } }).catch(() => {}) : Promise.resolve())
  let answer
  try {
    answer = await askSite(at.siteId, LIVE_PREVIEW_APP_METHODS.start, {
      livePreviewId: at.row.id, personId: at.personId, app: { ...spec, appId: app.id }, startedBy,
    })
  } catch (err) {
    await forget()
    throw err
  }
  if (!answer.ok) {
    await forget()
    return { ok: false, text: refusalWords(answer.refusal, at.siteName, at.row.branch) }
  }
  if ('refused' in answer.result) {
    await forget()
    return { ok: false, text: refusedText(answer.result, 'Nothing was started.') }
  }
  const updated = await prisma.liveApp.update({ where: { id: app.id }, data: { folder: spec.folder, command: spec.command, port: spec.port } })
  const seen = readAppSeen(answer.result.app)
  if (seen) {
    await keepAppSeen(updated, at.row, seen)
    await recordRunStart({
      app: updated, livePreviewId: at.row.id, userId: at.personId, startedAt: seen.since, agentId: startedBy?.agentId ?? null, runId: startedBy?.runId ?? null,
    })
  }
  return { ok: true, app: updated, status: answer.result.app }
}
