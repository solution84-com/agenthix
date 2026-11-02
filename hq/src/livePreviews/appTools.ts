/**
 * The agent's app tools (core's `APP_TOOL_DECLARATIONS`; live preview spec section 4, *The app*) on hq's data path:
 * `start_app`, `stop_app`, `list_apps`, `reload_view` and `set_auto_reload`. Starting the live preview is the
 * permission for them: there is no *Allow*. They are offered to every code-work run, and answered only while the
 * branch the run's own session works on has a live preview on the run's site, read from hq's rows at each call
 * (`livePreviewOfRun`); `start_app` on a branch with none opens it first, as the run's person (`runOpening.ts`). The
 * workspace and the branch are never arguments. The site checks its own record again (the
 * run going, on that branch).
 */
import { prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import {
  APP_SPEC_PROBLEMS, LIVE_PREVIEW_APP_METHODS, appSpecProblem,
  type AppSpec, type AppStatus, type AppToolResults,
} from '@agenthix/core'
import { ControlPlaneError, type CallerContext } from '../server/controlplane/types'
import { personOfRun } from '../server/controlplane/runOnBehalfOf'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { livePreviewOfRun } from './runs'
import { openLivePreviewForRun } from './runOpening'
import { askSite, SiteFailed, SiteSilent } from './siteAsk'
import { LIVE, touchLivePreview } from './store'
import { appNamed, keepAppSeen, readAppSeen } from './appStore'
import { refusedText, startAppIn } from './appStart'
import { servicesOf } from './questions'
import { appAddress } from '../relays'
import { emitLivePreviewAuto, emitLivePreviewReload } from './socket'
import { refusalWords } from './words'

type Calling = { row: LivePreview; siteId: string; siteName: string; agentId: string; runId: string; personId: string }

const NO_PREVIEW = 'This branch has no live preview open, so there is nothing for app tools to act on. Ask the person to start one from Live preview in the workspace view. Nothing was changed.'
const ON_ANOTHER_SITE = 'This branch\'s live preview runs on another site than this run, so its apps cannot be reached from here. The next run on this branch goes to that site and can start them. Nothing was changed.'

/** The run's live preview, as the call may use it; `start_app` opens one first when the branch has none (`runOpening.ts`). */
async function calling(ctx: CallerContext, runId: unknown, tool: string, opensOne = false): Promise<Calling> {
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', `${tool} is for an agent's run`)
  if (typeof runId !== 'string' || !runId || runId.length > 200) {
    throw new ControlPlaneError('invalid', `${tool} needs the run it is called from, which this site did not say. Nothing was changed.`)
  }
  const { claims } = ctx
  const run = await siteRuntimeStore.getRun(claims.siteId, runId)
  if (!run || run.sessionId !== claims.sessionId || (run.taskId ?? null) !== (claims.taskId ?? null)) {
    throw new ControlPlaneError('forbidden', `${tool} names a run that is not this one. Nothing was changed.`)
  }
  if (run.status !== 'RUNNING' && run.status !== 'PENDING') throw new ControlPlaneError('invalid', 'This run has already ended. Nothing was changed.')
  let found = await livePreviewOfRun(claims.sessionId, claims.siteId)
  if (!found && opensOne) {
    await openLivePreviewForRun(claims)
    found = await livePreviewOfRun(claims.sessionId, claims.siteId)
  }
  if (found === 'elsewhere') throw new ControlPlaneError('invalid', ON_ANOTHER_SITE)
  if (!found || !LIVE.includes(found.row.state)) throw new ControlPlaneError('invalid', NO_PREVIEW)
  const { row } = found
  const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, label: true } })
  if (!site) throw new ControlPlaneError('unavailable', NO_PREVIEW)
  await touchLivePreview(row.id)
  return { row, siteId: site.siteId, siteName: site.label, agentId: claims.agentId, runId, personId: (await personOfRun(claims)) ?? row.userId }
}

async function ask<T>(at: Calling, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof SiteSilent) throw new ControlPlaneError('unavailable', `${at.siteName} isn't answering now. Try again in a minute. Nothing was changed.`)
    if (err instanceof SiteFailed) throw new ControlPlaneError('unavailable', `${at.siteName} cannot run apps; it may need upgrading. Nothing was changed.`)
    throw err
  }
}

const PORT = /^\d{1,5}$/

/** The spec as the agent gave it, or the sentence that says what to give instead. */
export function readToolSpec(args: { name?: unknown; folder?: unknown; command?: unknown; port?: unknown }): Omit<AppSpec, 'appId'> {
  const raw = String(args.port ?? '').trim()
  const port = typeof args.port === 'number' ? args.port : PORT.test(raw) ? Number(raw) : NaN
  const folder = String(args.folder ?? '').trim().replace(/^\.?\/+/, '').replace(/\/+$/, '')
  const spec = { name: String(args.name ?? '').trim(), folder: folder === '.' ? '' : folder, command: String(args.command ?? '').trim(), port }
  const problem = appSpecProblem(spec, false)
  if (problem) throw new ControlPlaneError('invalid', `${APP_SPEC_PROBLEMS[problem]} Nothing was started.`)
  return spec
}

/** What the agent is told of an app: hq's record, with the state the site gave. */
function statusOf(app: LiveApp, row: LivePreview, seen: AppStatus | null): AppStatus {
  return {
    appId: app.id, name: app.name, folder: app.folder, command: app.command, port: app.port, livePreviewId: row.id,
    state: seen?.state ?? (app.livePreviewId === row.id ? (app.state as AppStatus['state']) : 'stopped'),
    since: seen?.since ?? app.since.toISOString(),
    lastLines: (seen?.lastLines ?? (Array.isArray(app.lastLines) ? (app.lastLines as string[]) : [])).slice(-20),
    detail: seen?.detail ?? (app.livePreviewId === row.id ? app.detail : null),
  }
}

export async function startAppOp(
  ctx: CallerContext, args: { name?: unknown; folder?: unknown; command?: unknown; port?: unknown; runId?: unknown },
): Promise<AppToolResults['start_app']> {
  const at = await calling(ctx, args?.runId, 'start_app', true)
  const spec = readToolSpec(args)
  const started = await ask(at, () => startAppIn(at, spec, { agentId: at.agentId, runId: at.runId }))
  if (!started.ok) throw new ControlPlaneError('conflict', started.text)
  const { app, status } = started
  const address = appAddress(app.id)
  return {
    app: statusOf(app, at.row, status),
    address,
    note: 'It is starting, and the person sees it in the live preview beside this conversation. Call list_apps to see when it runs, or why it failed.',
  }
}

export async function stopAppOp(ctx: CallerContext, args: { name?: unknown; runId?: unknown }): Promise<AppToolResults['stop_app']> {
  const at = await calling(ctx, args?.runId, 'stop_app')
  const app = await appNamed(at.row.workspaceId, at.row.branch, args?.name)
  if (!app) throw new ControlPlaneError('not_found', `This branch has no app called ${String(args?.name ?? '').slice(0, 40)}. list_apps shows its apps. Nothing was changed.`)
  const answer = await ask(at, () => askSite(at.siteId, LIVE_PREVIEW_APP_METHODS.stop, { livePreviewId: at.row.id, personId: at.personId, appId: app.id }))
  if (!answer.ok) throw new ControlPlaneError('conflict', refusalWords(answer.refusal, at.siteName, at.row.branch))
  if ('refused' in answer.result) {
    if (answer.result.refused === 'unknownApp') return { app: statusOf(app, at.row, null), note: `${app.name} is not running here, so there was nothing to stop.` }
    throw new ControlPlaneError('conflict', refusedText(answer.result, 'Nothing was changed.'))
  }
  const seen = readAppSeen(answer.result.app)
  if (seen) await keepAppSeen(app, at.row, seen)
  return { app: statusOf(app, at.row, answer.result.app), note: `${app.name} is stopped. start_app starts it again at the same address.` }
}

export async function listAppsOp(ctx: CallerContext, args: { runId?: unknown }): Promise<AppToolResults['list_apps']> {
  const at = await calling(ctx, args?.runId, 'list_apps')
  const listed = await ask(at, () => askSite(at.siteId, LIVE_PREVIEW_APP_METHODS.list, { livePreviewId: at.row.id }))
  if (!listed.ok) throw new ControlPlaneError('conflict', refusalWords(listed.refusal, at.siteName, at.row.branch))
  const running = new Map((Array.isArray(listed.apps) ? listed.apps : []).map(a => [a?.appId, a]))
  const apps = await prisma.liveApp.findMany({ where: { workspaceId: at.row.workspaceId, branch: at.row.branch }, orderBy: { name: 'asc' } })
  const services = Array.isArray(listed.services) ? listed.services.slice(0, 20) : servicesOf(at.row.id)
  const waiting = services.filter(s => s?.state === 'waiting').map(s => s.name)
  return {
    apps: apps.map(app => statusOf(app, at.row, (running.get(app.id) as AppStatus | undefined) ?? null)),
    services,
    note: waiting.length
      ? `Waiting for the person's yes in HQ: ${waiting.join(', ')}. Tell them what each is for; do not start them another way.`
      : apps.length ? 'These are the apps of this branch.' : 'No app has been started on this branch yet. Use start_app.',
  }
}

export async function reloadViewOp(ctx: CallerContext, args: { runId?: unknown }): Promise<AppToolResults['reload_view']> {
  const at = await calling(ctx, args?.runId, 'reload_view')
  const agent = await prisma.agent.findUnique({ where: { id: at.agentId }, select: { name: true } })
  emitLivePreviewReload(at.row, agent?.name ?? 'the agent')
  return { reloaded: true, note: 'The live preview the person sees was reloaded.' }
}

export async function setAutoReloadOp(ctx: CallerContext, args: { auto?: unknown; runId?: unknown }): Promise<AppToolResults['set_auto_reload']> {
  const at = await calling(ctx, args?.runId, 'set_auto_reload')
  if (typeof args?.auto !== 'boolean') throw new ControlPlaneError('invalid', 'set_auto_reload needs auto: true or false. Nothing was changed.')
  await prisma.livePreview.update({ where: { id: at.row.id }, data: { autoReload: args.auto } })
  emitLivePreviewAuto(at.row, args.auto)
  return {
    auto: args.auto,
    note: args.auto ? 'The live preview reloads by itself when you finish changing a file.' : 'Automatic reloading is off; the person presses Reload, or you call reload_view.',
  }
}

export const APP_TOOL_OPERATIONS = {
  start_app: startAppOp,
  stop_app: stopAppOp,
  list_apps: listAppsOp,
  reload_view: reloadViewOp,
  set_auto_reload: setAutoReloadOp,
} as const
