/**
 * Live previews (live preview spec sections 4 and 5), as hq and a site say them on the control channel, since site
 * protocol 1.12. The organisation's sites obey hq, so hq's own checks admit a live preview (the person's project role,
 * the site's *Live previews on this site*, its limit, one live preview per branch) and these methods carry no proof of
 * their own. The site still decides for itself what only it can know: its own setting and limit (`turnedOff`,
 * `atLimit`), its guard (`guardDown`), the host service's protections (`protectionsDown`), and that the copy named is
 * the one its own record holds for that workspace and branch (`noCopy`), never trusting what a copy's `.git` says.
 *
 * Apps, services and install scripts are `livePreviewApps.ts`; a branch sent to another site is `branchBundles.ts`.
 * Every params is read closed, field by field (livePreviewParse.ts): a field missing, extra, or not its shape answers
 * `malformed`.
 */
import type { LivePreviewRequest } from '../livePreview/livePreviewRequest.js'
import type { LivePreviewLimit, LivePreviewSummary } from '../livePreview/livePreview.js'
import type { GuardSignal, GuardStep } from '../livePreview/guard.js'
import type { BranchBackCause, CommitId, GitPerson, WorkspaceRepoRef } from './branchWork.js'

export const LIVE_PREVIEW_METHODS = {
  open: 'livePreview.open',
  /** Only a live preview the guard paused is resumed this way; a line-lost pause resumes by itself. */
  resume: 'livePreview.resume',
  stop: 'livePreview.stop',
  list: 'livePreview.list',
  act: 'livePreview.act',
  /** Bring a live preview's own copy up to `main`'s new tip, when `main` moved. */
  refresh: 'livePreview.refresh',
  /** The `commit` tool for a run working in a live preview's own copy on another site (copy kind `bundle`). */
  commit: 'livePreview.commit',
} as const

/** hq → a site, at every connect and on every change: its live-preview settings. */
export const SITE_LIVE_PREVIEWS_METHOD = 'site.livePreviews'

export const LIVE_PREVIEW_EVENTS = {
  state: 'livePreview.state',
  guard: 'livePreview.guard',
  guardReport: 'livePreview.guardReport',
  branchMoved: 'livePreview.branchMoved',
} as const

/**
 * Why the site refused:
 * - malformed: the params are not their shape.
 * - turnedOff: *Live previews on this site* is off; a fleet admin turns it on in the Fleet Console.
 * - atLimit: the site runs as many as its limit (`livePreviewIds` names them); stop one first.
 * - guardDown: the guard is not running, or has not reported in a minute, so none starts.
 * - protectionsDown: the host service's network protections for the live-preview part do not hold.
 * - branchOpen: the branch already has a live preview here (`livePreviewIds` names it).
 * - noCopy: the copy named is not the one this site holds for that workspace and branch, or is not here.
 * - noBundle: a `bundle` copy names a bundle this site does not hold.
 * - unknownPreview, stopped: no such live preview, or it has stopped.
 * - paused: it is paused; for a guard pause, a person resumes it after reading what tripped.
 * - notGuardPaused: a resume for a live preview that is not paused by the guard.
 * - noRun: the run named is not going, or not on this live preview's branch.
 * - appNotRunning: an `app.open` for an app not running in this live preview.
 * - serviceChanged: a `service.start` for a declaration the services file no longer holds; look again.
 * - noPackage: a `package.use` for a package nothing blocked in this live preview.
 */
export const LIVE_PREVIEW_REFUSALS = [
  'malformed', 'turnedOff', 'atLimit', 'guardDown', 'protectionsDown', 'branchOpen', 'noCopy', 'noBundle',
  'unknownPreview', 'stopped', 'paused', 'notGuardPaused', 'noRun', 'appNotRunning', 'serviceChanged', 'noPackage',
] as const
export type LivePreviewRefusalCode = (typeof LIVE_PREVIEW_REFUSALS)[number]

/** `message` is a sentence the person reads, ending "Nothing was changed." when nothing was. */
export type LivePreviewRefusal = { code: LivePreviewRefusalCode; message: string; livePreviewIds?: string[] }

export type LivePreviewAnswer<T> = ({ ok: true } & T) | { ok: false; refusal: LivePreviewRefusal }

/** What a live preview binds (`LivePreviewCopyKind`): the branch's own copy, a copy of `main`, or one from a bundle. */
export type LivePreviewCopyRef =
  | { kind: 'branch'; copyId: string }
  | { kind: 'main'; copyId: string }
  | { kind: 'bundle'; copyId: string; bundleId: string }

/**
 * hq names the live preview (a uuid). `branch` is the branch's name, or `main`'s when `onMain`. For a `branch` copy the
 * site checks its own record holds `copyId` for that workspace and branch; for `main` and `bundle` it makes the copy (`main`'s
 * outside every storage, a bundle's in `clones/<copyId>/` of the owner's storage, where the branch's runs there work).
 * The live preview's container binds that copy alone.
 */
export type LivePreviewOpenParams = {
  livePreviewId: string
  projectId: string | null
  personId: string
  workspace: WorkspaceRepoRef
  branch: string
  onMain: boolean
  copy: LivePreviewCopyRef
}
export type LivePreviewResult = LivePreviewAnswer<{ livePreview: LivePreviewSummary }>

export type LivePreviewResumeParams = { livePreviewId: string; personId: string }

/** Who stops a live preview, as hq decided they may (`LIVE_PREVIEW_STOP_REASONS` less what the site decides itself). */
export const LIVE_PREVIEW_STOPPERS = ['person', 'projectAdmin', 'fleetAdmin', 'idle', 'turnedOff', 'merged'] as const
export type LivePreviewStopper = (typeof LIVE_PREVIEW_STOPPERS)[number]
export type LivePreviewStopParams = { livePreviewId: string; by: LivePreviewStopper }
/**
 * `stopped` is false for one already stopped. For a `bundle` copy, anything left uncommitted is committed (*Work in
 * progress*) first and reported with `livePreview.branchMoved`, and the copy stays until hq has brought it back and
 * stops it again with nothing pending (`pendingBack`).
 */
export type LivePreviewStopResult = LivePreviewAnswer<{ stopped: boolean; pendingBack: boolean }>

export type LivePreviewListResult = { livePreviews: LivePreviewSummary[]; settings: SiteLivePreviewsParams }

export type LivePreviewActParams = { livePreviewId: string; personId: string; request: LivePreviewRequest }
/** A single-use ticket the site answers for an `app.open`; hq puts it in the app ticket as `siteTicket`. */
export type LivePreviewTicket = { ticket: string; expiresAt: string }
export type LivePreviewActOutcome =
  | { kind: 'app.open'; ticket: LivePreviewTicket }
  | { kind: 'service.start' | 'package.use'; accepted: true }
export type LivePreviewActResult = LivePreviewAnswer<{ outcome: LivePreviewActOutcome }>

/** `bundleId` is null on the workspace's own site, which fetches `head` from the workspace's repository. */
export type LivePreviewRefreshParams = { livePreviewId: string; head: CommitId; bundleId: string | null }
export type LivePreviewRefreshResult = LivePreviewAnswer<{ head: CommitId }>

/** As `branch.commit`, for a live preview's own copy; hq then brings the branch back by bundle. */
export type LivePreviewCommitParams = {
  livePreviewId: string
  message: string
  author: GitPerson
  onBehalfOf: GitPerson | null
  runId: string
}
export type LivePreviewCommitResult = LivePreviewAnswer<{
  result: { committed: true; commit: CommitId; files: number } | { committed: false; reason: 'nothing_to_commit' }
}>

/**
 * A site's live-preview settings, set by a fleet admin: whether live previews run here (off by default, on for HQ's
 * own site), the limit on how many at once (none by default), and *Stop when unused for*, in minutes (120 by default).
 */
export type SiteLivePreviewsParams = { allowed: boolean; limit: LivePreviewLimit; idleMinutes: number }
export type SiteLivePreviewsResult = { ok: true }

/** site → hq whenever a live preview's state or head changes; the whole summary each time. */
export type LivePreviewStateEvent = { livePreview: LivePreviewSummary; at: string }

/** site → hq when the guard acts: what it found, what it did, in a sentence the person reads. */
export type LivePreviewGuardEvent = {
  livePreviewId: string | null
  projectId: string | null
  signal: GuardSignal
  steps: GuardStep[]
  detail: string
  at: string
}

/** site → hq every `GUARD_REPORT_EVERY_MS` while the guard runs: hq starts none on a site whose report is stale. */
export type LivePreviewGuardReportEvent = { at: string; livePreviewIds: string[] }

/**
 * site → hq when the branch moved in a live preview's own copy on another site (copy kind `bundle`): on its
 * one-minute sweep while a run goes, at a run's end, or when the site started again. hq brings it back by bundle.
 */
export type LivePreviewBranchMovedEvent = {
  livePreviewId: string
  branch: string
  head: CommitId
  previous: CommitId
  cause: BranchBackCause
  runId: string | null
}
