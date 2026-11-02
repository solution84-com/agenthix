/**
 * Apps, services and install scripts in a live preview (live preview spec section 4, *The app*), as hq and the site
 * say them on the control channel, since site protocol 1.12.
 *
 * - **Apps.** The agent's `start_app`, `stop_app` and `list_apps` reach hq's data path, which finds the run's branch
 *   and its live preview, records the app the first time on that branch (giving it its id) and asks the site:
 *   `livePreview.appStart`, `livePreview.appStop`, `livePreview.appList`. `livePreview.appStart` answers once the app
 *   is starting; `livePreview.appState` says each change after.
 * - **Services.** The site reads the copy's services file when an app starts, and says what it found with
 *   `livePreview.services`. A new or changed service is `waiting` until a person says yes in HQ to its declaration
 *   (`service.start`, `livePreview.act`).
 * - **Install scripts.** A package whose script the rule blocks is said with `livePreview.packageBlocked`, for the
 *   agent's step and, when it finds no other package, the person's question; their yes is `package.use`
 *   (`livePreview.act`).
 */
import type { AppRun, AppSpec, AppStatus } from '../livePreview/apps.js'
import type { InstallScriptVerdict, PackageFacts } from '../livePreview/installScripts.js'
import type { ServiceProblem, ServiceStatus } from '../livePreview/services.js'
import type { LivePreviewAnswer } from './livePreviews.js'

export const LIVE_PREVIEW_APP_METHODS = {
  start: 'livePreview.appStart',
  stop: 'livePreview.appStop',
  list: 'livePreview.appList',
} as const

export const LIVE_PREVIEW_APP_EVENTS = {
  appState: 'livePreview.appState',
  services: 'livePreview.services',
  packageBlocked: 'livePreview.packageBlocked',
} as const

/**
 * Why the site would not start, stop or list an app, beyond a live preview's own refusals (`LivePreviewRefusal`,
 * answered as `ok: false`): the spec is not one (`APP_SPEC_PROBLEMS`), no such app, too many apps, a port another app
 * or a service of the live preview has, or its services file was refused (`problems`).
 */
export const LIVE_PREVIEW_APP_REFUSALS = ['badSpec', 'unknownApp', 'tooManyApps', 'portTaken', 'servicesRefused'] as const
export type LivePreviewAppRefusalCode = (typeof LIVE_PREVIEW_APP_REFUSALS)[number]
export type LivePreviewAppRefused = { refused: LivePreviewAppRefusalCode; detail: string; problems?: ServiceProblem[] }

/**
 * `startedBy`: the agent's run that asked, which the site checks is going and on this live preview's branch
 * (refusal `noRun`); null when a person, or an approved *Start live preview* workflow, started it from HQ.
 */
export type LivePreviewAppStartParams = {
  livePreviewId: string
  personId: string
  app: AppSpec
  startedBy: { agentId: string; runId: string } | null
}
export type LivePreviewAppStartResult = LivePreviewAnswer<{ result: { app: AppStatus } | LivePreviewAppRefused }>

export type LivePreviewAppStopParams = { livePreviewId: string; personId: string; appId: string }
export type LivePreviewAppStopResult = LivePreviewAnswer<{ result: { app: AppStatus } | LivePreviewAppRefused }>

export type LivePreviewAppListParams = { livePreviewId: string }
export type LivePreviewAppListResult = LivePreviewAnswer<{ apps: AppStatus[]; services: ServiceStatus[] }>

/** site → hq whenever an app's state changes; `run` is the run that ended, when one did. */
export type LivePreviewAppStateEvent = { app: AppStatus; run: AppRun | null; at: string }

/** site → hq whenever the live preview's services, or what was refused in its services file, change. */
export type LivePreviewServicesEvent = {
  livePreviewId: string
  services: ServiceStatus[]
  problems: ServiceProblem[]
  at: string
}

/**
 * site → hq when the rule blocks a package's install script in a live preview. `question` is the sentence a person
 * is asked if the agent finds no other package (`installScriptQuestion`); it is never asked before that.
 */
export type LivePreviewPackageBlockedEvent = {
  livePreviewId: string
  runId: string | null
  package: { ecosystem: string; name: string; version: string }
  verdict: InstallScriptVerdict
  facts: PackageFacts | null
  question: string
  at: string
}
