/**
 * The live preview's words in the workspace view (live preview spec section 4, *States*, and section 5): its state,
 * where it runs and how full that is, each app and service, and the refusal an operation answered. A refusal's
 * sentence is HQ's own, already saying what is wrong and what to do; the screen shows it as it came.
 */
import type { AppState, LivePreviewLimit, LivePreviewStateName, ServiceState } from '@agenthix/core'
import type { LiveAppView, LivePreviewSecretsView, LivePreviewSiteView, LivePreviewView } from '../livePreviews/types'
import { pressFailureWords } from '../shared/failureWords'

export const PREVIEW_STATE_LABEL: Record<LivePreviewStateName, string> = {
  starting: 'Starting', running: 'Running', paused: 'Paused', stopped: 'Stopped',
}

/** "preview-box · 2 of 6 open", "preview-box · 2 open" with no limit. */
export function siteLoad(site: Pick<LivePreviewSiteView, 'name' | 'open' | 'limit'>): string {
  return `${site.name} · ${openOf(site.open, site.limit)}`
}

export const openOf = (open: number, limit: LivePreviewLimit): string => (limit === null ? `${open} open` : `${open} of ${limit} open`)

/** "preview-box has 6 of 6 open". */
export const fullWords = (site: Pick<LivePreviewSiteView, 'name' | 'open' | 'limit'>): string =>
  `${site.name} has ${openOf(site.open, site.limit)}`

export const APP_STATE_LABEL: Record<AppState, string> = {
  starting: 'Starting', running: 'Running', paused: 'Paused', stopped: 'Stopped', failed: 'Did not start',
}

/** What a person reads under an app: what it is doing, or why it is not. */
export function appLine(app: Pick<LiveAppView, 'state' | 'detail' | 'folder' | 'command'>): string {
  const where = `${app.folder ? `${app.folder}/` : 'The workspace root'} · ${app.command}`
  switch (app.state) {
    case 'starting': return `Starting: ${where}`
    case 'running': return where
    case 'paused': return 'Paused with the live preview. It starts again when the live preview resumes.'
    case 'stopped': return 'Not running. Ask the agent to start it.'
    case 'failed': return app.detail ? `It did not start: ${app.detail}` : 'It did not start. The agent sees its output and usually fixes it.'
  }
}

export const SERVICE_STATE_LABEL: Record<ServiceState, string> = {
  waiting: 'Waiting for a yes', starting: 'Starting', running: 'Running', stopped: 'Stopped', failed: 'Failed',
}

/** The address bar's text for an app: its address without the scheme's slashes doubled, as a person reads it. */
export function shownAddress(address: string | null): string {
  if (!address) return 'No address'
  return address.replace(/\/+$/, '')
}

/** The sentence an operation's refusal carries; HQ's own words, with a fallback for anything that is not one. */
export function refusalOf(err: unknown, fallback: string): string {
  return pressFailureWords(err, `${fallback} Nothing was changed.`)
}

/** The refusal's code, when HQ gave one a screen may branch on (`noDelivery`, `full`, `notRepository` …). */
export function refusalCode(err: unknown): string | null {
  const data = (err as { data?: unknown } | null)?.data
  const code = data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined
  if (typeof code === 'string') return code
  const nested = data && typeof data === 'object' ? (data as { data?: { code?: unknown } }).data?.code : undefined
  return typeof nested === 'string' ? nested : null
}

/** The strip's line when no app runs in this live preview. */
export function noAppLine(onMain: boolean, startable: boolean): string {
  if (startable) return 'No app is running yet. Start one:'
  return onMain
    ? 'No app is running yet, and none has run on this workspace. An agent on a branch starts one with start_app.'
    : 'No app is running yet. Ask the agent in the conversation to start the app.'
}

/**
 * The middle's line while no app shows (spec part 4, *States*): a running live preview with no app says so plainly,
 * and how to start one.
 */
export function waitingWords(
  view: Pick<LivePreviewView, 'state' | 'onMain' | 'startable'>,
  app: Pick<LiveAppView, 'name' | 'state'> | null,
  canAct: boolean,
): string {
  if (view.state === 'starting') return 'Starting the live preview: installing what it needs and starting its container.'
  if (view.state === 'paused') return 'The live preview is paused.'
  if (app?.state === 'starting') return `${app.name} is starting. It shows here once it answers.`
  if (app?.state === 'failed') return `${app.name} did not start. Its last lines are on the strip above: Restart tries again, or ask the agent to fix it.`
  if (app?.state === 'running') return `${app.name} is not answering yet. It shows here once it does.`
  const first = view.startable[0]?.name
  if (!canAct) return 'No app is running in this live preview yet. A Member or Admin of the project starts one.'
  if (first) return `No app is running in this live preview yet. Press Start ${first} on the strip above, or ask the agent in the conversation to start it.`
  if (view.onMain) return 'No app is running in this live preview yet, and no app has run on this workspace. Ask an agent on a branch to start the app with start_app; once it has run, you can start it here.'
  return 'No app is running in this live preview yet. Ask the agent in the conversation to start the app; once it has run on this branch, you can start it again from the strip.'
}

/** What the strip says of the live preview's last secrets run. */
export function secretsLine(s: LivePreviewSecretsView): string {
  const name = s.kind === 'start' ? 'start-live-preview' : 'reload-live-preview'
  if (s.state === 'going') return `${name} is running. Its secrets go to the app's container only.`
  if (s.state === 'passed') {
    return s.names.length
      ? `${name} passed and handed ${s.names.join(', ')} to the app's container. An app reads each at /run/secrets/<NAME>.`
      : `${name} passed, but its steps name no secrets, so nothing was handed to the app.`
  }
  const why = s.message?.trim() || (s.state === 'stopped' ? `${name} was stopped.` : `${name} failed.`)
  return /secret/i.test(why) ? why : `${why} No secrets were handed to the app.`
}

/** The apps still running from before the secrets were handed: they read them only once restarted. */
export function appsToRestart(apps: Pick<LiveAppView, 'appId' | 'name' | 'state' | 'since'>[], s: LivePreviewSecretsView | null): Pick<LiveAppView, 'appId' | 'name'>[] {
  if (!s || s.state !== 'passed' || s.names.length === 0) return []
  return apps.filter(a => (a.state === 'running' || a.state === 'starting') && a.since < s.at)
}

/** What *Start* runs, shown on its button. */
export function startableTitle(a: { command: string; port: number; folder: string; fromBranch: string | null }): string {
  const where = a.folder ? ` in ${a.folder}` : ''
  return `${a.command}${where}, on port ${a.port}${a.fromBranch ? `, as last started on ${a.fromBranch}` : ''}`
}

export const STARTED_BY = (name: string, yours: boolean) => (yours ? 'Started by you' : `Started by ${name}`)
export const PREVIEW_VIEWER_REASON = 'You can see live previews here. Starting and stopping one needs a Member or Admin of the project.'
