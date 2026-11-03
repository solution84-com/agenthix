/**
 * The workspace view's operations for live previews (live preview spec sections 4 and 5). Every query needs read
 * access to the workspace (a project's Viewer included); every action but opening an app needs a Member or Admin of
 * the project, or the owner of their own storage. The work is in the modules beside this one. Each refuses first while
 * the live preview's flag is off (`requireFeature`), and does nothing.
 */
import { HttpError } from 'wasp/server'
import { requireFeature } from '../features/requireFeature'
import { getLivePreviewPlaces } from './places'
import { startLivePreview } from './opening'
import { stopLivePreview } from './stopping'
import {
  answerLivePreviewQuestion, getLivePreview, markLivePreviewInUse, reloadLivePreview, resumeLivePreview, setLivePreviewAuto,
} from './personActions'
import { openLiveApp } from './appEntry'
import { restartLiveApp, startLiveApp, stopLiveApp } from './personApps'
import { runLivePreviewWorkflow, type LivePreviewWorkflowKind } from './workflowSecrets'
import type { LiveAppEntryForm, LivePreviewPlaces, LivePreviewView, OpenLiveAppInput, StartLivePreviewInput } from './types'
// Registers the site's live-preview events and the run listener with the site channel, as the server starts.
import './siteEvents'
import './reconcile'

type Ctx = { user?: { id: string } | null }

function me(c: Ctx): string {
  if (!c.user) throw new HttpError(401, 'Not authenticated')
  return c.user.id
}

/** The operation, behind the live preview's flag: off, it answers 404 *not available* before anything else. */
function gated<A, R>(op: (a: A, c: Ctx) => Promise<R>): (a: A, c: Ctx) => Promise<R> {
  return async (a, c) => {
    await requireFeature('livePreview')
    return op(a, c)
  }
}

/** What *Live preview* shows for a branch (`branchId` null for `main`): its live preview, or where one may start. */
export const getLivePreviewPlacesQuery = gated((a: { workspaceId: string; branchId: string | null }, c: Ctx): Promise<LivePreviewPlaces> =>
  getLivePreviewPlaces(me(c), a?.workspaceId, a?.branchId ?? null))

/** One live preview, with its apps, services and the questions it waits on. */
export const getLivePreviewQuery = gated((a: { livePreviewId: string }, c: Ctx): Promise<LivePreviewView> => getLivePreview(me(c), a?.livePreviewId))

export const startLivePreviewAction = gated((a: StartLivePreviewInput, c: Ctx): Promise<LivePreviewView> =>
  startLivePreview(me(c), a ?? ({} as StartLivePreviewInput)))

export const stopLivePreviewAction = gated((a: { livePreviewId: string }, c: Ctx): Promise<{ stopped: boolean }> => stopLivePreview(me(c), a?.livePreviewId))

export const resumeLivePreviewAction = gated((a: { livePreviewId: string }, c: Ctx): Promise<LivePreviewView> => resumeLivePreview(me(c), a?.livePreviewId))

export const reloadLivePreviewAction = gated((a: { livePreviewId: string }, c: Ctx): Promise<void> => reloadLivePreview(me(c), a?.livePreviewId))

export const setLivePreviewAutoAction = gated((a: { livePreviewId: string; auto: boolean }, c: Ctx): Promise<void> =>
  setLivePreviewAuto(me(c), a?.livePreviewId, a?.auto))

/** Called about once a minute while the live preview is shown, so it does not stop as unused. */
export const markLivePreviewInUseAction = gated((a: { livePreviewId: string }, c: Ctx): Promise<void> => markLivePreviewInUse(me(c), a?.livePreviewId))

/** A yes to a waiting service (`service.start`) or a blocked install script (`package.use`), as the question named it. */
export const answerLivePreviewQuestionAction = gated((a: { livePreviewId: string; request: unknown }, c: Ctx): Promise<void> =>
  answerLivePreviewQuestion(me(c), a?.livePreviewId, a?.request))

/** *Start* on the strip: an app known on the workspace, as it was last started, in this live preview. */
export const startLiveAppAction = gated((a: { livePreviewId: string; name: string }, c: Ctx): Promise<{ appId: string }> =>
  startLiveApp(me(c), a?.livePreviewId, a?.name))

/** *Stop* on the strip: one app of this live preview stops; the live preview goes on. */
export const stopLiveAppAction = gated((a: { livePreviewId: string; appId: string }, c: Ctx): Promise<void> =>
  stopLiveApp(me(c), a?.livePreviewId, a?.appId))

/** *Restart* on the strip: one app stops and starts again as it was, in the same container. */
export const restartLiveAppAction = gated((a: { livePreviewId: string; appId: string }, c: Ctx): Promise<{ appId: string }> =>
  restartLiveApp(me(c), a?.livePreviewId, a?.appId))

export const openLiveAppAction = gated((a: OpenLiveAppInput, c: Ctx): Promise<LiveAppEntryForm> => openLiveApp(me(c), a ?? ({} as OpenLiveAppInput)))

/** Runs the workspace's approved *Start live preview* or *Reload live preview* workflow into the app's own container. */
export const runLivePreviewWorkflowAction = gated((a: { livePreviewId: string; kind: LivePreviewWorkflowKind }, c: Ctx): Promise<{ runId: string }> =>
  runLivePreviewWorkflow(me(c), a?.livePreviewId, a?.kind))
