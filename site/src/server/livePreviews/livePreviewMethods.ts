/**
 * hq's methods for live previews on this site (site protocol 1.12, core's `livePreviews.ts`), beyond opening and
 * resuming (`livePreviewOpening.ts`): stopping, listing, a person's requests, `main` moving, the `commit` tool in a
 * live preview's own copy, and the site's settings. Each reads its own params and answers a refusal as a value.
 */
import { z } from 'zod'
import {
  BRANCH_WORK_SITE_BUDGET_MS, BUNDLE_WORK_SITE_BUDGET_MS, LIVE_PREVIEW_STOP_REASONS,
  isCommitId, isCommitMessage, isGitEmail, isGitPersonName,
  parseLivePreviewActParams, parseLivePreviewRefreshParams, parseLivePreviewStopParams, parseSiteLivePreviewsParams,
  type LivePreviewActResult, type LivePreviewCommitResult, type LivePreviewListResult, type LivePreviewRefreshResult,
  type LivePreviewStopper, type LivePreviewStopResult, type SiteLivePreviewsResult,
} from '@agenthix/core'
import { inTurn, placeWorkspace } from '../branches/branchCalls'
import { withOnBehalfOf } from '../branches/branchWorkMethods'
import { runGoing } from './livePreviewActivity'
import { bundleFile } from './bundles/bundleStore'
import { copyPlaceOf, previewHelper } from './livePreviewCopies'
import { finishOwnCopy, stopPreview } from './livePreviewLife'
import { summaryOf } from './livePreviewRows'
import { apps } from './livePreviewRuntime'
import { seams } from './livePreviewSeams'
import { livePreviewSettings, setLivePreviewSettings } from './livePreviewSettings'
import { issueTicket } from './livePreviewTickets'
import { changeLivePreview, liveLivePreviews, livePreviewRow } from './livePreviewStore'
import { MALFORMED, STOPPED, UNKNOWN, pausedRefusal, refuse } from './livePreviewWords'

const STOP_DETAIL: Record<LivePreviewStopper, string> = {
  person: 'A person stopped this live preview. Its branch and work are untouched.',
  projectAdmin: 'One of the project\'s admins stopped this live preview. Its branch and work are untouched.',
  fleetAdmin: 'A fleet admin stopped this live preview in the Fleet Console. Its branch and work are untouched.',
  idle: 'Nobody used this live preview for a while, so it stopped. Its branch and work are untouched.',
  turnedOff: 'A fleet admin turned live previews off on this site, so this one stopped. Its branch and work are untouched.',
  merged: 'Its branch was merged and closed, so this live preview stopped.',
}

export async function livePreviewStop(params: unknown): Promise<LivePreviewStopResult> {
  const p = parseLivePreviewStopParams(params)
  if (!p || !(LIVE_PREVIEW_STOP_REASONS as readonly string[]).includes(p.by)) return MALFORMED
  const row = await livePreviewRow(p.livePreviewId)
  if (!row) return UNKNOWN
  if (row.state.state === 'stopped') return { ok: true, stopped: false, ...(await finishOwnCopy(row.id)) }
  return { ok: true, ...(await stopPreview(row.id, p.by, STOP_DETAIL[p.by])) }
}

export async function livePreviewList(): Promise<LivePreviewListResult> {
  return { livePreviews: (await liveLivePreviews()).map(summaryOf), settings: livePreviewSettings() }
}

export async function livePreviewAct(params: unknown): Promise<LivePreviewActResult> {
  const p = parseLivePreviewActParams(params)
  if (!p) return MALFORMED
  const row = await livePreviewRow(p.livePreviewId)
  if (!row) return UNKNOWN
  if (row.state.state === 'stopped') return STOPPED
  if (row.state.state === 'paused') return pausedRefusal(row.state.reason)
  const r = p.request
  if (r.kind === 'app.open') {
    if (!apps.openable(row.id, r.appId)) {
      return refuse('appNotRunning', 'That app is not running in this live preview. Start it again, then open it. Nothing was changed.')
    }
    return { ok: true, outcome: { kind: 'app.open', ticket: issueTicket({ livePreviewId: row.id, personId: p.personId, appId: r.appId, entry: r.entry }) } }
  }
  if (r.kind === 'service.start') {
    if (!(await seams.services.approve(row.id, r.service, r.declaration))) {
      return refuse('serviceChanged', `The services file no longer declares ${r.service} as it was shown. Look at it again. Nothing was changed.`)
    }
    return { ok: true, outcome: { kind: 'service.start', accepted: true } }
  }
  if (!seams.installs.allow(row.id, { ecosystem: r.ecosystem, name: r.name, version: r.version }, { workspaceId: row.workspaceId, branch: row.branch })) {
    return refuse('noPackage', `Nothing blocked ${r.name} ${r.version} in this live preview. Nothing was changed.`)
  }
  return { ok: true, outcome: { kind: 'package.use', accepted: true } }
}

/**
 * `main` moved. `main`'s own copy on the workspace's site is brought up to its new tip from the workspace's
 * repository; a live preview's own copy on another site from the bundle hq sent: `main`'s live preview moves to it,
 * a branch's keeps it as `origin`'s `main` for `update_from_main`. A branch's copy on its workspace's site needs
 * nothing: its runs read `main` from the workspace's repository.
 */
export async function livePreviewRefresh(params: unknown): Promise<LivePreviewRefreshResult> {
  const p = parseLivePreviewRefreshParams(params)
  if (!p) return MALFORMED
  const row = await livePreviewRow(p.livePreviewId)
  if (!row) return UNKNOWN
  if (row.state.state === 'stopped') return STOPPED
  const dir = copyPlaceOf(row).hostDir
  if (row.copyKind === 'branch') return { ok: true, head: p.head }
  if (row.copyKind === 'main') {
    if (p.bundleId !== null) return MALFORMED
    const placed = await placeWorkspace({ ownerType: row.ownerType, ownerId: row.ownerId, workspaceId: row.workspaceId }, 'livePreview.refresh').catch(() => null)
    if (!placed) return refuse('noCopy', 'This site no longer holds the workspace of this live preview. Nothing was changed.')
    const answer = await inTurn(row.workspaceId, () => previewHelper(
      { workspaceId: row.workspaceId, ws: { dir: placed.ws, readOnly: true }, copy: { dir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
      { op: 'refreshMain', head: p.head }, `livePreview.refresh of live preview ${row.id}`,
    ))
    if (!answer) return refuse('noCopy', 'This site could not bring main\'s copy up to date; the reason is in its log. Nothing was changed.')
  } else {
    if (p.bundleId === null) return refuse('noBundle', 'main moved, but no bundle of it came with the request. Nothing was changed.')
    const answer = await previewHelper(
      { workspaceId: row.workspaceId, copy: { dir, readOnly: false }, bundle: { file: bundleFile(p.bundleId) }, network: false, timeoutMs: BUNDLE_WORK_SITE_BUDGET_MS },
      { op: 'bundleRefresh', branch: row.branch, onMain: row.onMain, head: p.head }, `livePreview.refresh of live preview ${row.id}`,
    )
    if (!answer) return refuse('noBundle', 'The bundle of main could not be read on this site; HQ sends it again. Nothing was changed.')
  }
  if (row.onMain) await changeLivePreview(row.id, cur => ({ row: cur ? { ...cur, headCommit: p.head } : null, result: null }))
  return { ok: true, head: p.head }
}

const gitPerson = z.object({ name: z.string().refine(isGitPersonName), email: z.string().refine(isGitEmail) }).strict()
const commitParams = z.object({
  livePreviewId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  message: z.string().refine(isCommitMessage),
  author: gitPerson,
  onBehalfOf: gitPerson.nullable(),
  runId: z.string().min(1).max(200),
}).strict()

/** The `commit` tool for a run working in a live preview's own copy on this site; hq then brings the branch back. */
export async function livePreviewCommit(params: unknown): Promise<LivePreviewCommitResult> {
  const parsed = commitParams.safeParse(params)
  if (!parsed.success) return MALFORMED
  const q = parsed.data
  const row = await livePreviewRow(q.livePreviewId)
  if (!row) return UNKNOWN
  if (row.state.state === 'stopped') return STOPPED
  if (row.copyKind !== 'bundle') return refuse('noCopy', 'This live preview runs from the branch\'s own copy; its commits are made there. Nothing was changed.')
  if (!runGoing(row.workspaceId, row.branch, q.runId)) {
    return refuse('noRun', 'The run that asked is not going on this live preview\'s branch here. Nothing was changed.')
  }
  const answer = await previewHelper(
    { workspaceId: row.workspaceId, copy: { dir: copyPlaceOf(row).hostDir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
    { op: 'copyCommit', branch: row.branch, message: withOnBehalfOf(q.message, q.onBehalfOf), author: q.author, at: new Date().toISOString() },
    `livePreview.commit in live preview ${row.id}`,
  )
  if (!answer) return refuse('noCopy', 'The commit could not be made in this live preview\'s copy; the reason is in this site\'s log. Nothing was changed.')
  if (answer.nothing) return { ok: true, result: { committed: false, reason: 'nothing_to_commit' } }
  const commit = String(answer.commit)
  if (!isCommitId(commit)) return refuse('noCopy', 'The commit could not be read back. Nothing was changed.')
  await changeLivePreview(row.id, cur => ({ row: cur ? { ...cur, headCommit: commit } : null, result: null }))
  return { ok: true, result: { committed: true, commit, files: Number(answer.files) || 0 } }
}

/**
 * *Live previews on this site* and its limits, from hq at every connect and on every change. Turning it off stops
 * every live preview here (hq has asked the fleet admin first); lowering the limit stops none.
 */
export async function siteLivePreviews(params: unknown): Promise<SiteLivePreviewsResult> {
  const p = parseSiteLivePreviewsParams(params)
  if (!p) throw new Error('site.livePreviews: the settings could not be read.')
  setLivePreviewSettings(p)
  if (!p.allowed) for (const row of await liveLivePreviews()) await stopPreview(row.id, 'turnedOff', STOP_DETAIL.turnedOff)
  return { ok: true }
}
