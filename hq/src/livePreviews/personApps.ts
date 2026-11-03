/**
 * A person's own hand on a live preview's apps, from its strip (live preview spec section 4, *The app*), in any live
 * preview, `main`'s included:
 *
 * - *Start* an app known for it (`knownApps.ts`), with the folder, command and port it was last started with;
 * - *Stop* and *Restart* one of its apps, as the agent's `stop_app` and `start_app` do: the container stays, so the
 *   secrets handed to it stay, and a restarted app reads them;
 * - starting a live preview starts the app started last with it, so the person sees the app (`startAppOnOpen`).
 *
 * Only a Member or Admin of the project (or the owner of their own storage) acts, through HQ; the site checks its own
 * record again. A Viewer reads the list and changes nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import type { LiveApp, LivePreview } from '@prisma/client'
import { LIVE_PREVIEW_APP_METHODS } from '@agenthix/core'
import { askSite, SiteFailed, SiteSilent } from './siteAsk'
import { appToOpenWith, knownApps } from './knownApps'
import { refusedText, startAppIn } from './appStart'
import { keepAppSeen, readAppSeen } from './appStore'
import { reachLivePreview } from './personActions'
import { NOTHING, refusalWords, siteSilent } from './words'

type Site = { siteId: string; name: string }

function runningOnly(row: LivePreview): void {
  if (row.state === 'PAUSED') throw new HttpError(409, `This live preview is paused. Resume it first. ${NOTHING}`)
  if (row.state !== 'RUNNING') throw new HttpError(409, `This live preview is not running. Start it again from Live preview. ${NOTHING}`)
}

async function asked<T>(site: Site, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof SiteSilent) throw siteSilent(site.name)
    if (err instanceof SiteFailed) throw new HttpError(502, `${site.name} cannot run apps; it may need upgrading. ${NOTHING}`)
    throw err
  }
}

async function startAs(row: LivePreview, site: Site, userId: string, app: Pick<LiveApp, 'name' | 'folder' | 'command' | 'port'>): Promise<{ appId: string }> {
  const started = await asked(site, () => startAppIn(
    { row, siteId: site.siteId, siteName: site.name, personId: userId },
    { name: app.name, folder: app.folder, command: app.command, port: app.port },
    null,
  ))
  if (!started.ok) throw new HttpError(409, started.text)
  return { appId: started.app.id }
}

/** *Start* on the strip: the app of that name, as it was last started. */
export async function startLiveApp(userId: string, livePreviewId: unknown, name: unknown): Promise<{ appId: string }> {
  const { row, site } = await reachLivePreview(userId, livePreviewId, 'work')
  runningOnly(row)
  const wanted = typeof name === 'string' ? name.trim() : ''
  const known = wanted && wanted.length <= 64 ? (await knownApps(row)).find(a => a.name === wanted) : undefined
  if (!known) {
    throw new HttpError(404, `No app called ${wanted.slice(0, 40) || 'that'} was started ${row.onMain ? 'on this workspace' : 'on this branch'} yet. Ask the agent to start it with start_app. ${NOTHING}`)
  }
  return startAs(row, site, userId, known)
}

/** This live preview's app, by its id: only an app of its own workspace and branch. */
async function appOf(row: LivePreview, appId: unknown): Promise<LiveApp> {
  const app = typeof appId === 'string' && appId.length <= 64
    ? await prisma.liveApp.findFirst({ where: { id: appId, workspaceId: row.workspaceId, branch: row.branch } })
    : null
  if (!app) throw new HttpError(404, `This live preview has no such app. Reload to see its apps. ${NOTHING}`)
  return app
}

/** Asks the site to stop the app; an app not running there is already stopped. */
async function stopOnSite(row: LivePreview, site: Site, userId: string, app: LiveApp): Promise<void> {
  const answer = await asked(site, () => askSite(site.siteId, LIVE_PREVIEW_APP_METHODS.stop, { livePreviewId: row.id, personId: userId, appId: app.id }))
  if (!answer.ok) throw new HttpError(409, refusalWords(answer.refusal, site.name, row.branch))
  if ('refused' in answer.result) {
    if (answer.result.refused === 'unknownApp') return
    throw new HttpError(409, refusedText(answer.result, NOTHING))
  }
  const seen = readAppSeen(answer.result.app)
  if (seen) await keepAppSeen(app, row, seen)
}

/** *Stop* on the strip: the app stops; the live preview and its container go on. */
export async function stopLiveApp(userId: string, livePreviewId: unknown, appId: unknown): Promise<void> {
  const { row, site } = await reachLivePreview(userId, livePreviewId, 'work')
  runningOnly(row)
  await stopOnSite(row, site, userId, await appOf(row, appId))
}

/** *Restart* on the strip: the app stops and starts again as it was, in the same container, so it reads the secrets. */
export async function restartLiveApp(userId: string, livePreviewId: unknown, appId: unknown): Promise<{ appId: string }> {
  const { row, site } = await reachLivePreview(userId, livePreviewId, 'work')
  runningOnly(row)
  const app = await appOf(row, appId)
  await stopOnSite(row, site, userId, app)
  return startAs(row, site, userId, app)
}

/**
 * After a person's *Start live preview* ran it: the app started last on its branch (on `main`, on any branch) starts
 * with it, as that person. Nothing when none is known, or when it is not running; a refusal is left for the strip to
 * show on the app, and never fails the start.
 */
export async function startAppOnOpen(row: LivePreview, site: Site): Promise<void> {
  if (row.state !== 'RUNNING') return
  const app = await appToOpenWith(row)
  if (!app) return
  await startAppIn({ row, siteId: site.siteId, siteName: site.name, personId: row.userId }, { name: app.name, folder: app.folder, command: app.command, port: app.port }, null)
    .catch(() => undefined)
}
