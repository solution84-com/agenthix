/**
 * What hq's live-preview operations answer the screens (live preview spec sections 4 and 5). Client-safe: types only.
 * Type aliases, not interfaces, so they pass Wasp's superjson payloads.
 */
import type {
  AppState, LivePreviewLimit, LivePreviewStateName, ServiceStatus, AppEntry, AppCookieKind,
} from '@agenthix/core'

export type LivePreviewSiteView = {
  executionSiteId: string
  name: string
  open: number
  limit: LivePreviewLimit
}

export type LiveAppView = {
  appId: string
  name: string
  folder: string
  command: string
  port: number
  state: AppState
  since: string
  detail: string | null
  lastLines: string[]
  /** The app's address on this install; null when HQ has no preview address (then no live app opens). */
  address: string | null
}

/**
 * An app a person may start from the strip: one known on the workspace, with the folder, command and port it was last
 * started with. `fromBranch` names the other branch it was last started on; null for the live preview's own branch.
 */
export type StartableAppView = {
  name: string
  folder: string
  command: string
  port: number
  fromBranch: string | null
}

/** A question waiting for a person's yes: a new or changed service, or a blocked package's install script. */
export type LivePreviewQuestion =
  | { kind: 'service.start'; service: string; declaration: string; image: string | null; question: string }
  | { kind: 'package.use'; ecosystem: string; name: string; version: string; question: string }

/**
 * The live preview's last *Start with secrets* or *Reload with secrets* run: going, then the names it handed to the
 * app's container (never a value), or why it did not.
 */
export type LivePreviewSecretsView = {
  runId: string
  kind: 'start' | 'reload'
  state: 'going' | 'passed' | 'failed' | 'stopped'
  /** The secrets' names the app's container holds from it; empty until it passed. */
  names: string[]
  /** Why it failed or stopped, in the run's own words. */
  message: string | null
  /** When it ended, or when it was asked for while it goes. */
  at: string
}

export type LivePreviewView = {
  livePreviewId: string
  workspaceId: string
  /** hq's id for the branch; null for `main`'s live preview. */
  branchId: string | null
  branch: string
  onMain: boolean
  state: LivePreviewStateName
  /** Why it paused or stopped (core's pause and stop reasons); null otherwise. */
  reason: string | null
  /** HQ's sentence for a pause or a stop. */
  detail: string | null
  since: string
  site: LivePreviewSiteView
  startedBy: { id: string; name: string }
  yours: boolean
  /** The person may stop it: their own, or any in the project for a project Admin. */
  mayStop: boolean
  /** Only a guard pause is resumed by a person who may work here. */
  mayResume: boolean
  autoReload: boolean
  openedAt: string
  lastUsedAt: string
  apps: LiveAppView[]
  /** Apps known on the workspace that are not going here now: *Start* on the strip, for a person who may work here. */
  startable: StartableAppView[]
  services: ServiceStatus[]
  questions: LivePreviewQuestion[]
  /** The place's *Start live preview* and *Reload live preview* workflows that are there, approved and switched on. */
  workflows: { start: boolean; reload: boolean }
  /** Its last secrets run since HQ started, for a person who may work here; null when none ran in it. */
  secrets: LivePreviewSecretsView | null
}

/** A live preview open on a full site, as *Live preview* lists them: whose, which branch, when last used. */
export type OpenLivePreviewLine = {
  livePreviewId: string
  workspaceName: string
  branch: string
  person: { id: string; name: string }
  lastUsedAt: string
  /** The person may stop it from here. */
  mayStop: boolean
}

/** Where a live preview of this branch may start: HQ's pick first, then each other allowed site, with how full it is. */
export type LivePreviewPlaces = {
  /** The branch's live preview when it has one: a second person sees the same one. */
  current: LivePreviewView | null
  /** The person may start one here (a Member or Admin). */
  mayStart: boolean
  /** Why none can start at all, in a sentence: no domain for live apps, or no site allows them now. Null when one can. */
  blocked: string | null
  /** The workspace is not a Git repository yet: *Live preview* offers to turn Git on first. */
  needsGit: boolean
  picked: LivePreviewSiteView | null
  others: Array<LivePreviewSiteView & { blocked: string | null; full: boolean }>
  /** When the picked site is the workspace's own and it is full: the live previews open there. */
  full: { site: LivePreviewSiteView; open: OpenLivePreviewLine[] } | null
  /**
   * When none runs: why the branch's last one stopped, in HQ's words, so an idle or fleet-admin stop stays readable
   * after the screen that saw it closed. Null before the branch's first, or when it holds no reason.
   */
  lastStopped: { reason: string; detail: string; at: string } | null
}

export type StartLivePreviewInput = { workspaceId: string; branchId: string | null; executionSiteId?: string | null }

/** What the browser's form posts to the app's address to enter it (core's `appDoor.ts`). Never put in a link. */
export type LiveAppEntryForm = {
  action: string
  field: string
  ticket: string
  origin: string
  target: AppCookieKind
  expiresAt: number
}

export type OpenLiveAppInput = { livePreviewId: string; appId: string; entry: AppEntry; cookie?: AppCookieKind }
