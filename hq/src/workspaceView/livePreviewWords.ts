/**
 * The live preview's words in the workspace view (live preview spec section 4, *States*, and section 5): its state,
 * where it runs and how full that is, each app and service, and the refusal an operation answered. A refusal's
 * sentence is HQ's own, already saying what is wrong and what to do; the screen shows it as it came.
 */
import type { AppState, LivePreviewLimit, LivePreviewStateName, ServiceState } from '@agenthix/core'
import type { LiveAppView, LivePreviewSiteView } from '../livePreviews/types'

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
  if (err instanceof Error && err.message.trim()) return err.message
  return `${fallback} Nothing was changed.`
}

/** The refusal's code, when HQ gave one a screen may branch on (`noDelivery`, `full`, `notRepository` …). */
export function refusalCode(err: unknown): string | null {
  const data = (err as { data?: unknown } | null)?.data
  const code = data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined
  if (typeof code === 'string') return code
  const nested = data && typeof data === 'object' ? (data as { data?: { code?: unknown } }).data?.code : undefined
  return typeof nested === 'string' ? nested : null
}

/** The strip's line when no app has run in this live preview yet. */
export function noAppLine(onMain: boolean, startable: boolean): string {
  if (startable) return 'No app running here yet. Start one:'
  return onMain
    ? 'No app yet. An app an agent started on any branch of this workspace can be started here.'
    : 'No app yet: the agent starts one with start_app. Once an app has run on any branch, you can start it here too.'
}

/** What *Start* runs, shown on its button. */
export function startableTitle(a: { command: string; port: number; folder: string; fromBranch: string | null }): string {
  const where = a.folder ? ` in ${a.folder}` : ''
  return `${a.command}${where}, on port ${a.port}${a.fromBranch ? `, as last started on ${a.fromBranch}` : ''}`
}

export const STARTED_BY = (name: string, yours: boolean) => (yours ? 'Started by you' : `Started by ${name}`)
export const PREVIEW_VIEWER_REASON = 'You can see live previews here. Starting and stopping one needs a Member or Admin of the project.'
export const RELOADED_BY = (by: string) => `Reloaded by ${by}`
