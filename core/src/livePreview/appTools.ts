/**
 * The agent's app tools (live preview spec section 4, *The app*): `start_app`, `stop_app`, `list_apps`, `reload_view`
 * and `set_auto_reload`. Offered to every code-work run, and acting on the live preview of the run's branch on the
 * run's site. `start_app` on a branch with none opens it first, as the run's person; the others are refused then, with
 * a sentence that says to have the person open it.
 * Starting the live preview is the permission for them: there is no *Allow*. Declared once here, in the workflow
 * tools' shape, so hq's validators and the site's forwarded copies are built from the same words. The site fills in
 * the calling run's id; hq finds the branch and its live preview from it at each call. The workspace and branch are
 * never arguments.
 *
 * Written for the baseline model: each says when to use it and what it answers.
 */
import type { WorkflowToolArg } from '../workflows/agentTools.js'
import type { AppStatus } from './apps.js'
import type { ServiceStatus } from './services.js'
import type { ToolArea } from '../harness/toolAreas.js'

export const START_APP_TOOL = 'start_app'
export const STOP_APP_TOOL = 'stop_app'
export const LIST_APPS_TOOL = 'list_apps'
export const RELOAD_VIEW_TOOL = 'reload_view'
export const SET_AUTO_RELOAD_TOOL = 'set_auto_reload'

/**
 * The names a place gives its live-preview workflows (*Start with secrets*, *Reload with secrets* on the strip). They are
 * the person's: `run_workflow` refuses them to an agent, whose way to start or reload the app is the app tools.
 */
export const LIVE_PREVIEW_WORKFLOW_NAMES = { start: 'start-live-preview', reload: 'reload-live-preview' } as const

/** Whether a workflow's name is one of the live preview's own, compared as a person would read it. */
export function isLivePreviewWorkflowName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n === LIVE_PREVIEW_WORKFLOW_NAMES.start || n === LIVE_PREVIEW_WORKFLOW_NAMES.reload
}

export type AppToolName =
  | typeof START_APP_TOOL | typeof STOP_APP_TOOL | typeof LIST_APPS_TOOL | typeof RELOAD_VIEW_TOOL | typeof SET_AUTO_RELOAD_TOOL

/** `set_auto_reload`'s one argument is a boolean, which the workflow tools' shape has no type for. */
export type AppToolArg = WorkflowToolArg | { type: 'boolean'; description: string }

export type AppToolDeclaration = {
  name: AppToolName
  area: ToolArea
  description: string
  args: Record<string, AppToolArg>
  runIdFromCaller: true
}

const APP_NAME: WorkflowToolArg = {
  type: 'string', maxLength: 40,
  description: 'The app\'s name: lower-case letters, digits and dashes, such as web or admin-api',
}

export const APP_TOOL_DECLARATIONS: readonly AppToolDeclaration[] = [
  {
    name: START_APP_TOOL,
    area: 'apps',
    description:
      'Start an app, such as a dev server, in this branch\'s live preview, so the person sees it beside your ' +
      'conversation: its folder, command and port (localhost is fine). One of the same name is restarted at the same ' +
      'address. Install its dependencies first. Answers once it is starting; list_apps shows when it runs, or why it ' +
      'failed. With no live preview open it opens one for the person, so call it then only when they asked to see, ' +
      'run or start the app.',
    args: {
      name: APP_NAME,
      folder: { type: 'string', maxLength: 1024, description: 'The folder inside your working folder the command runs in, such as web; empty for the working folder itself' },
      command: { type: 'string', maxLength: 4096, description: 'The command that starts it, such as npm run dev' },
      port: { type: 'string', maxLength: 5, description: 'The port the app listens on, as a number, such as 5173' },
    },
    runIdFromCaller: true,
  },
  {
    name: STOP_APP_TOOL,
    area: 'apps',
    description: 'Stop an app you started with start_app. It stays listed, and start_app starts it again at the same address.',
    args: { name: APP_NAME },
    runIdFromCaller: true,
  },
  {
    name: LIST_APPS_TOOL,
    area: 'apps',
    description:
      'List the apps in this branch\'s live preview (name, folder, command, port, whether it runs, its last lines) ' +
      'and the services beside them, with any waiting for the person\'s yes.',
    args: {},
    runIdFromCaller: true,
  },
  {
    name: RELOAD_VIEW_TOOL,
    area: 'apps',
    description:
      'Reload the live preview the person sees: when they ask ("reload it", "show me the changes"), and after you ' +
      'commit a change to what the app shows.',
    args: {},
    runIdFromCaller: true,
  },
  {
    name: SET_AUTO_RELOAD_TOOL,
    area: 'apps',
    description:
      'Switch automatic reloading of the live preview, which by default reloads each time a commit reaches your ' +
      'branch: auto false when the person asks you to stop (they then press Reload), true to go back.',
    args: {
      auto: { type: 'boolean', description: 'true reloads on each commit; false leaves it to the person' },
    },
    runIdFromCaller: true,
  },
]

export const APP_TOOL_NAMES: ReadonlySet<string> = new Set(APP_TOOL_DECLARATIONS.map(d => d.name))

export type AppToolArgs = {
  start_app: { name: string; folder: string; command: string; port: string }
  stop_app: { name: string }
  list_apps: Record<string, never>
  reload_view: Record<string, never>
  set_auto_reload: { auto: boolean }
}

/** What each tool answers the agent; `note` says what happened in words, and what to do next when it matters. */
export type AppToolResults = {
  start_app: { app: AppStatus; address: string | null; note: string }
  stop_app: { app: AppStatus; note: string }
  list_apps: { apps: AppStatus[]; services: ServiceStatus[]; note: string }
  reload_view: { reloaded: true; note: string }
  set_auto_reload: { auto: boolean; note: string }
}
