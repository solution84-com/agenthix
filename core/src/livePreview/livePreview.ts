/**
 * A live preview (live preview spec section 4): the app running from one branch of a code workspace, or from its
 * `main`, in a container of its own on one of the organisation's sites. One per branch; a second person choosing it
 * sees the same one. HQ's checks admit it (a Member or Admin of the project, the site's *Live previews on this site*,
 * its limit), and the site checks its own record again.
 *
 * What it binds, its copy (`LivePreviewCopyKind`):
 * - `branch`: on the workspace's own site, the branch's existing copy (`clones/<copyId>/`), the same folder the
 *   branch's agent works in, so a change the agent saves reaches the running app at once;
 * - `main`: on the workspace's own site, a copy of its own made from `main` when it starts and brought up to date
 *   when `main` moves, because the workspace's own folder is read-only and an app writes build output; it is outside
 *   every storage, since no agent works on `main`;
 * - `bundle`: on another site, a copy of its own made from a Git bundle of the branch (or of `main`) sent through the
 *   relay (`protocol/branchBundles.ts`), in `clones/<copyId>/` of the owner's storage on that site, as a branch's copy
 *   is. While it runs there, the branch's runs go to that site and work in that copy, and each commit comes back to
 *   the workspace's site the same way.
 *
 * Its record never leaves the site; hq and the Fleet Console see `LivePreviewSummary`.
 */
import type { GuardSignal } from './guard.js'

/** Without a line to hq this long, the site pauses its live previews; they resume by themselves when it is back. */
export const LIVE_PREVIEW_LINE_LOSS_PAUSE_MS = 15 * 1000
/** *Stop when unused for*, per site, when the fleet admin set nothing: two hours. */
export const LIVE_PREVIEW_IDLE_MINUTES_DEFAULT = 120
/** The shortest and longest *Stop when unused for* a fleet admin may set, in minutes. */
export const LIVE_PREVIEW_IDLE_MINUTES_MIN = 5
export const LIVE_PREVIEW_IDLE_MINUTES_MAX = 7 * 24 * 60
/** The highest *Live previews at once* that may be set for one site. */
export const LIVE_PREVIEW_LIMIT_MAX = 64
/** *Live previews at once* when nobody set a limit: none. Each live preview keeps its own ceiling. */
export const LIVE_PREVIEW_LIMIT_DEFAULT: LivePreviewLimit = null
/** A limit on *Live previews at once*: a whole number from 1 to `LIVE_PREVIEW_LIMIT_MAX`; null for none. */
export type LivePreviewLimit = number | null
/** A single-use ticket the site answers for an app's entry is used once, within this. */
export const LIVE_PREVIEW_TICKET_LIFE_MS = 60 * 1000

/** A limit as a setting: a whole number in range, or null for none; undefined when it is neither. */
export function parseLivePreviewLimit(v: unknown): LivePreviewLimit | undefined {
  if (v === null) return null
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= LIVE_PREVIEW_LIMIT_MAX ? v : undefined
}

/** *Stop when unused for* as a setting, in whole minutes; undefined when it is not one. */
export function parseLivePreviewIdleMinutes(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= LIVE_PREVIEW_IDLE_MINUTES_MIN && v <= LIVE_PREVIEW_IDLE_MINUTES_MAX
    ? v : undefined
}

/** Whether `open` live previews leave room for one more under `limit`. Lowering a limit stops none; new ones wait. */
export function livePreviewLimitAllows(limit: LivePreviewLimit, open: number): boolean {
  return limit === null || open < limit
}

export const LIVE_PREVIEW_COPY_KINDS = ['branch', 'main', 'bundle'] as const
export type LivePreviewCopyKind = (typeof LIVE_PREVIEW_COPY_KINDS)[number]

/**
 * Why a live preview paused:
 * - lineLost: the site lost hq's line for `LIVE_PREVIEW_LINE_LOSS_PAUSE_MS`; it resumes by itself when it is back.
 * - guard: the guard found something unexpected (`signal` says what); a person resumes it after reading what tripped.
 */
export const LIVE_PREVIEW_PAUSE_REASONS = ['lineLost', 'guard'] as const
export type LivePreviewPauseReason = (typeof LIVE_PREVIEW_PAUSE_REASONS)[number]

/**
 * Why a live preview stopped:
 * - person: a person stopped it (its starter, or anyone who may on the branch).
 * - projectAdmin: one of the project's admins stopped it.
 * - fleetAdmin: a fleet admin stopped it in the Fleet Console.
 * - idle: unused for the site's *Stop when unused for*: no one had it open and no run was going on its branch.
 * - turnedOff: a fleet admin turned *Live previews on this site* off.
 * - guard: the guard ended it.
 * - resources: the machine ran out of memory.
 * - merged: its branch was merged and closed, so its copy is removed.
 * - failed: it did not start; `detail` says why, and nothing was left behind.
 */
export const LIVE_PREVIEW_STOP_REASONS = [
  'person', 'projectAdmin', 'fleetAdmin', 'idle', 'turnedOff', 'guard', 'resources', 'merged', 'failed',
] as const
export type LivePreviewStopReason = (typeof LIVE_PREVIEW_STOP_REASONS)[number]

/**
 * Where a live preview stands (spec section 4, *States*). `detail` is a sentence a person reads.
 * - starting: installing if needed and starting the container.
 * - running: apps and services may run.
 * - paused: every container of it paused.
 * - stopped: its containers are gone; the branch, its copy and its work are untouched.
 */
export type LivePreviewState =
  | { state: 'starting'; since: string }
  | { state: 'running'; since: string }
  | { state: 'paused'; since: string; reason: LivePreviewPauseReason; signal: GuardSignal | null; detail: string }
  | { state: 'stopped'; since: string; reason: LivePreviewStopReason; signal: GuardSignal | null; detail: string }

export const LIVE_PREVIEW_STATE_NAMES = ['starting', 'running', 'paused', 'stopped'] as const
export type LivePreviewStateName = (typeof LIVE_PREVIEW_STATE_NAMES)[number]

/**
 * A live preview as hq and the Fleet Console see it. `branch` is the branch's name, or `main`'s for `main`'s live
 * preview (`onMain`). `head` is the commit its copy is on, as the site last read it.
 */
export type LivePreviewSummary = {
  livePreviewId: string
  projectId: string | null
  /** Who started it: a person stops their own, a project Admin any in the project. */
  personId: string
  workspaceId: string
  branch: string
  onMain: boolean
  copy: { kind: LivePreviewCopyKind; copyId: string }
  head: string | null
  openedAt: string
  state: LivePreviewState
}

/** Whether a live preview in `state` still holds its container or may be resumed. */
export function livePreviewIsLive(state: LivePreviewState): boolean {
  return state.state !== 'stopped'
}

/**
 * hq's record of commits in a live preview's own copy on another site that are not yet back in the workspace's
 * repository (copy kind `bundle`), and how far bringing them back got: the bundle made there (`bundle.make`), carried
 * through the relay, then brought back on the workspace's site (`branch.bringBackBundle`). Kept so a stop or a
 * restart finishes it. `detail` says why the last attempt failed.
 */
export type LivePreviewPendingBack = {
  since: string
  head: string
  /** The branch's tip in the workspace's repository, which the bundle's prerequisites are taken from. */
  previous: string | null
  step: 'make' | 'carry' | 'bringBack'
  bundleId: string | null
  detail: string | null
}
