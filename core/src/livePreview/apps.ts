/**
 * A live app (live preview spec section 4, *The app*): a name, a folder, a command and a port in one branch's live
 * preview, one running copy per name. hq records it the first time it is started on that branch and gives it its id,
 * the id of its address for good (relay/previewAddress.ts), so the address stays the same across restarts and two
 * branches each running `web` keep separate addresses. The site runs it in the live preview's container through the
 * sandbox launcher and registers its port with the guard.
 */
import { HARNESS_PORTS } from '../ports/ports.js'
import { isAppId } from '../relay/previewAddress.js'
import { checkPath } from './canonical.js'

export type AppSpec = {
  /** The app's id: its address's, given by hq when first recorded. */
  appId: string
  name: string
  /** The folder the command runs in, inside the branch's copy; empty for the copy's root. */
  folder: string
  command: string
  port: number
}

/**
 * What hq keeps about an app: the spec, its workspace and its branch (`main`'s name for `main`'s live preview). It is
 * known by the workspace, the branch and the name; its row stays until the workspace is removed.
 */
export type AppRecord = AppSpec & { workspaceId: string; branch: string; createdAt: string }

/**
 * - `starting`: the command runs; the site waits up to `APP_START_WAIT_MS` for the port to answer.
 * - `running`: its pages reach the person through a relay.
 * - `paused`: its live preview is paused; it starts again when the live preview resumes, if it was running.
 * - `stopped`: by `stop_app`, or the live preview stopped.
 * - `failed`: it did not answer, or exited.
 */
export const APP_STATES = ['starting', 'running', 'paused', 'stopped', 'failed'] as const
export type AppState = (typeof APP_STATES)[number]

/** How one run of an app ended. */
export const APP_RUN_ENDINGS = ['stopped', 'replaced', 'previewPaused', 'previewStopped', 'exited', 'noAnswer', 'guard'] as const
export type AppRunEnding = (typeof APP_RUN_ENDINGS)[number]

/** One run of an app, as hq records it: who started it, when, how it ended, and its last output. */
export type AppRun = {
  appId: string
  livePreviewId: string
  /** The person whose work started it: the run's, or the one who started it from HQ. */
  personId: string
  /** The agent whose run started it; null when a person or an approved workflow did. */
  agentId: string | null
  runId: string | null
  startedAt: string
  endedAt: string | null
  ending: AppRunEnding | null
  /** At most `APP_OUTPUT_LINES` lines of what it printed last, each at most `APP_OUTPUT_LINE_CHARS`. */
  lastLines: string[]
}

/** An app as the site reports it, in a live preview. */
export type AppStatus = AppSpec & {
  livePreviewId: string
  state: AppState
  /** Since when it has been in this state. */
  since: string
  lastLines: string[]
  /** Why it failed or stopped, in a sentence the person and the agent read; null otherwise. */
  detail: string | null
}

export const APP_START_WAIT_MS = 60_000
export const APP_OUTPUT_LINES = 40
export const APP_OUTPUT_LINE_CHARS = 500
/** A live preview runs at most this many apps at once. */
export const APPS_PER_LIVE_PREVIEW = 8

/** An app's port: unprivileged (an app never runs as root), never one the platform's own processes use. */
export const APP_PORT_RANGE = { first: 1024, last: 65535 } as const
export const LIVE_PREVIEW_RESERVED_PORTS: readonly number[] = Object.values(HARNESS_PORTS)

const NAME = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/
const MAX_COMMAND = 4096

/** Why an app's spec is refused, each said so the agent knows what to do instead. */
export const APP_SPEC_PROBLEMS = {
  name: 'An app\'s name is 1 to 40 lower-case letters, digits and dashes, such as web or admin-api.',
  folder: 'The folder must be a path inside your working folder, such as web, or empty for its root.',
  command: 'The command is one line of at most 4096 characters, such as npm run dev.',
  port: `The port is a whole number from ${APP_PORT_RANGE.first} to ${APP_PORT_RANGE.last}.`,
  reservedPort: `Ports ${LIVE_PREVIEW_RESERVED_PORTS.join(', ')} are the platform's own; choose another port.`,
  appId: 'The app\'s id is not one hq gave.',
} as const
export type AppSpecProblem = keyof typeof APP_SPEC_PROBLEMS

/** The first thing wrong with a spec, or null. The id is checked only when `withId` (hq gives it after this check). */
export function appSpecProblem(spec: Omit<AppSpec, 'appId'> & { appId?: string }, withId = true): AppSpecProblem | null {
  if (typeof spec.name !== 'string' || !NAME.test(spec.name)) return 'name'
  if (typeof spec.folder !== 'string') return 'folder'
  if (spec.folder !== '') {
    try { checkPath(spec.folder) } catch { return 'folder' }
  }
  if (typeof spec.command !== 'string' || !spec.command.trim() || spec.command.length > MAX_COMMAND
    || /[\r\n\0]/.test(spec.command)) return 'command'
  if (!Number.isInteger(spec.port) || spec.port < APP_PORT_RANGE.first || spec.port > APP_PORT_RANGE.last) return 'port'
  if (LIVE_PREVIEW_RESERVED_PORTS.includes(spec.port)) return 'reservedPort'
  if (withId && !isAppId(spec.appId)) return 'appId'
  return null
}

/** The last `APP_OUTPUT_LINES` lines of output, each cut to `APP_OUTPUT_LINE_CHARS`, control characters removed. */
export function lastOutputLines(output: string): string[] {
  const lines = output.replace(/\r\n?/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  // Terminal colour and cursor sequences, then any other control character but a tab.
  return lines.slice(-APP_OUTPUT_LINES)
    .map(l => l.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, APP_OUTPUT_LINE_CHARS))
}
