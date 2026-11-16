/**
 * The tools' answers in a task run's check: fixed, from world.ts, in the real tools' words where hq has them (the
 * refusals of `run_workflow` and `run_task`). Nothing reaches a database, a site or a live preview.
 */
import { COMMIT_RELOAD_NOTE, LIVE_PREVIEW_WORKFLOW_NAMES, isLivePreviewWorkflowName } from '@agenthix/core'
import { livePreviewWorkflowRefusal } from '../../../workflows/livePreviewRefusal'
import { OWN_TASK } from '../../../server/controlplane/runTaskWords'
import { FILES, KERNEL, MAIN_PAGE_TEXT, PAGE, PAGE_TEXT, MORNING_ROUTINE, NEXT_TASK, SHOP_APP, SHOP_PROJECT, SHOP_TASK, WORKING_FOLDER } from './world'
import type { TaskRunSetup } from './setup'
import { runShell } from '../shell'

type Args = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const refused = (error: string) => ({ error })

const isTask = (v: unknown, t: { id: string; key: string }) => str(v).trim() === t.id || str(v).trim().toUpperCase() === t.key

const NO_PREVIEW = 'This branch has no live preview open, so there is nothing for app tools to act on. Ask the person to start one from Live preview in the workspace view. Nothing was changed.'

/** What the branch's files and live preview are as the run goes: a run's edits and commits change them. */
export interface RunState { files: Record<string, string>; changed: Set<string>; open: boolean }

export function startState(open: boolean): RunState {
  return { files: { ...FILES }, changed: new Set(), open }
}

/** A path as the agent gave it: relative to the working folder when it is in it, else as given (main's files). */
function relative(p: string): string {
  return p.startsWith(`${WORKING_FOLDER}/`) || !p.startsWith('/') ? p.replace(WORKING_FOLDER, '').replace(/^\.?\/+/, '') : p
}

const app = (state: 'running' | 'starting') => ({
  name: SHOP_APP.name, folder: SHOP_APP.folder, command: SHOP_APP.command, port: SHOP_APP.port, state,
  lastLines: ['> shop@1.0.0 start', `Listening on http://localhost:${SHOP_APP.port}`],
})

function readFile(args: Args, state: RunState): unknown {
  const p = relative(str(args.file_path) || str(args.path))
  return p in state.files ? state.files[p] : refused(`File not found: ${p}`)
}

function edit(args: Args, state: RunState, whole: boolean): unknown {
  const p = relative(str(args.file_path) || str(args.path))
  if (whole) state.files[p] = str(args.content)
  else {
    const now = state.files[p]
    if (now === undefined) return refused(`File not found: ${p}`)
    if (!now.includes(str(args.old_string))) return refused('old_string was not found in the file.')
    state.files[p] = now.replace(str(args.old_string), str(args.new_string))
  }
  state.changed.add(p)
  return `The file ${p} was ${whole ? 'written' : 'edited'}.`
}

const commitAll = (state: RunState) => { state.changed.clear() }

const BRANCH = 'add-free-delivery-over-50-banner-to-shop-s-home'
const LAST_COMMIT = '8b1e4a0 Add the free delivery banner'

/** Git in the run's branch: its commits, its status from the run's own edits, and a commit of them. */
function git(args: string, state: RunState): string | null {
  const [sub = ''] = args.split(/\s+/)
  switch (sub) {
    case 'commit': {
      const had = state.changed.size
      commitAll(state)
      return had ? `[${BRANCH} 3c9e1d2] Update the banner` : 'nothing to commit, working tree clean'
    }
    case 'status':
      return state.changed.size
        ? `On branch ${BRANCH}\nChanges not staged for commit:\n${[...state.changed].map(f => `\tmodified:   ${f}`).join('\n')}`
        : `On branch ${BRANCH}\nnothing to commit, working tree clean`
    case 'log': return `${LAST_COMMIT}${/--all|--decorate/.test(args) ? ` (HEAD -> ${BRANCH})` : ''}\n1f0c3a7 Start the shop${/--all|--decorate/.test(args) ? ' (main)' : ''}`
    case 'show':
      if (/main:public\/index\.html/.test(args)) return MAIN_PAGE_TEXT
      if (/:public\/index\.html/.test(args)) return PAGE_TEXT
      return `commit 8b1e4a0\nAuthor: Kernel <kernel@agents.hq.invalid>\n\n    Add the free delivery banner\n\n public/index.html | 1 +\n 1 file changed, 1 insertion(+)`
    case 'diff':
      if (/\bmain\b/.test(args)) return ' public/index.html | 1 +\n 1 file changed, 1 insertion(+)'
      return [...state.changed].map(f => `diff --git a/${f} b/${f}`).join('\n')
    case 'ls-files': return Object.keys(state.files).filter(f => !f.startsWith('/')).sort().join('\n')
    case 'branch': return `* ${BRANCH}\n  main`
    case 'rev-parse':
      if (/--abbrev-ref/.test(args)) return BRANCH
      return /\bmain\b/.test(args) ? '1f0c3a7e9b2d4c6a8f0e1d3b5a7c9e2f4d6b8a0c' : '8b1e4a0c2d9f4e1a7b3c5d6e8f9a0b1c2d3e4f5a'
    case 'add': return ''
    default: return null
  }
}

function bash(command: string, state: RunState): string {
  return runShell(command, {
    folder: WORKING_FOLDER, files: state.files, git: args => git(args, state),
    // The shop serves its home page on its port, whatever the path, as server.js does.
    fetch: url => (url.includes(`:${SHOP_APP.port}`) ? state.files[PAGE] ?? null : null),
  })
}

export function answerTaskRun(name: string, input: unknown, setup: TaskRunSetup, state: RunState): unknown {
  const args = (input && typeof input === 'object' ? input : {}) as Args
  switch (name) {
    case 'read_file': return readFile(args, state)
    case 'glob_files': return Object.keys(state.files).filter(f => !f.startsWith('/')).map(f => `${WORKING_FOLDER}/${f}`).join('\n')
    case 'grep_files': {
      const pattern = str(args.pattern).toLowerCase()
      const hits = Object.entries(state.files).filter(([f, text]) => !f.startsWith('/') && text.toLowerCase().includes(pattern)).map(([f]) => `${WORKING_FOLDER}/${f}`)
      return hits.length ? hits.join('\n') : 'No matches found.'
    }
    case 'write_file': return edit(args, state, true)
    case 'edit_file': return edit(args, state, false)
    case 'bash': return bash(str(args.command), state)
    case 'commit':
      if (!state.changed.size) return refused('Nothing to commit: your working folder has no changes.')
      commitAll(state)
      return { committed: true, commit: '3c9e1d2', branch: 'add-free-delivery-over-50-banner-to-shop-s-home', files: 1, ...(state.open ? { note: COMMIT_RELOAD_NOTE } : {}) }
    case 'update_from_main':
      return (setup.behindMain ?? 0) > 0
        ? { clashes: ['package.json'], note: 'main came in with clashes in these files: remove the conflict markers, then call commit to finish the merge.' }
        : { clashes: [], note: 'Your branch already has everything main has.' }
    case 'list_apps':
      if (!state.open) return refused(NO_PREVIEW)
      return { apps: setup.openLivePreview?.runningApps.length ? [app('running')] : [], services: [], note: 'The apps in this branch\'s live preview.' }
    case 'start_app':
      state.open = true
      return { app: app('starting'), address: 'https://p-7a1f.preview.example', note: 'The app is starting; call list_apps to see when it runs.' }
    case 'stop_app': return state.open ? { app: { ...app('running'), state: 'stopped' }, note: 'Stopped.' } : refused(NO_PREVIEW)
    case 'reload_view': return state.open ? { reloaded: true, note: 'The person\'s view of the live preview reloads now.' } : refused(NO_PREVIEW)
    case 'set_auto_reload': return state.open ? { auto: args.auto === true, note: 'Done.' } : refused(NO_PREVIEW)
    case 'list_workflows':
      return { workflows: [
        { name: LIVE_PREVIEW_WORKFLOW_NAMES.start, description: 'Hands SHOP_API_KEY to the shop\'s live preview app', enabled: true, approvedVersion: 1, parameters: [] },
        { name: 'deploy-staging', description: 'Deploys main to staging', enabled: true, approvedVersion: 2, parameters: [] },
      ] }
    case 'run_workflow':
      return isLivePreviewWorkflowName(str(args.name)) ? refused(livePreviewWorkflowRefusal(str(args.name))) : { id: 'wr-1', workflow: str(args.name), state: 'PASSED', steps: [] }
    case 'run_task':
      if (isTask(args.taskId, NEXT_TASK)) return { taskId: NEXT_TASK.id, executionState: 'WAITING', note: "It starts when this agent's running task in this project finishes" }
      return isTask(args.taskId, SHOP_TASK) ? refused(OWN_TASK) : refused(`Task ${str(args.taskId)} not found`)
    case 'get_task_details':
      if (isTask(args.taskId, NEXT_TASK)) {
        return { taskId: NEXT_TASK.id, taskKey: NEXT_TASK.key, title: NEXT_TASK.title, description: NEXT_TASK.description, state: 'TODO', executionState: 'NOT_STARTED', assignedAgentId: KERNEL.id, comments: [] }
      }
      return { taskId: SHOP_TASK.id, taskKey: SHOP_TASK.key, title: SHOP_TASK.title, description: SHOP_TASK.description, status: 'IN_PROGRESS', column: 'In progress', comments: setup.newComments ?? [] }
    case 'list_projects': return { projects: [SHOP_PROJECT] }
    case 'list_agents': return { agents: [KERNEL] }
    case 'list_tasks':
      return { tasks: [
        { taskId: SHOP_TASK.id, key: SHOP_TASK.key, title: SHOP_TASK.title, state: 'IN_PROGRESS', executionState: 'RUNNING', assignedAgentId: KERNEL.id },
        { taskId: NEXT_TASK.id, key: NEXT_TASK.key, title: NEXT_TASK.title, state: 'TODO', executionState: 'NOT_STARTED', assignedAgentId: KERNEL.id },
      ] }
    case 'create_task': return { success: true, taskId: 'c0ffee00-0000-4000-8000-000000000009', task: { key: 'SHOP-9', title: str(args.title), state: 'BACKLOG' } }
    case 'create_routine':
      return { routineId: 'rt-new', nextRunAt: '2026-11-09T09:00:00.000Z', timezone: str(args.timezone) || MORNING_ROUTINE.timezone }
    case 'update_routine':
      if (str(args.routineId) !== MORNING_ROUTINE.id) return refused(`Routine ${str(args.routineId)} not found`)
      return { routineId: MORNING_ROUTINE.id, enabled: args.enabled !== false, nextRunAt: args.enabled === false ? null : '2026-11-09T09:00:00.000Z' }
    case 'ping': return { pong: true }
    case 'web_fetch': return refused(`Could not fetch ${str(args.url)}: the page did not answer.`)
    default: return { ok: true }
  }
}
