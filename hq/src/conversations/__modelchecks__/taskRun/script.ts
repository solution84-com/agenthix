/**
 * The tools' answers in a task run's check: fixed, from world.ts, in the real tools' words where hq has them (the
 * refusals of `run_workflow` and `run_task`). Nothing reaches a database, a site or a live preview.
 */
import { COMMIT_RELOAD_NOTE, LIVE_PREVIEW_WORKFLOW_NAMES, isLivePreviewWorkflowName } from '@agenthix/core'
import { livePreviewWorkflowRefusal } from '../../../workflows/livePreviewRefusal'
import { OWN_TASK } from '../../../server/controlplane/runTaskWords'
import { FILES, SHOP_APP, SHOP_TASK, WORKING_FOLDER } from './world'
import type { TaskRunSetup } from './setup'

type Args = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const refused = (error: string) => ({ error })

const NO_PREVIEW = 'This branch has no live preview open, so there is nothing for app tools to act on. Ask the person to start one from Live preview in the workspace view. Nothing was changed.'

/** What the branch's files and live preview are as the run goes: a run's edits and commits change them. */
export interface RunState { files: Record<string, string>; changed: Set<string>; open: boolean }

export function startState(open: boolean): RunState {
  return { files: { ...FILES }, changed: new Set(), open }
}

/** A path as the agent gave it, relative to the working folder. */
function relative(p: string): string {
  return p.replace(WORKING_FOLDER, '').replace(/^\.?\/+/, '')
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

/** The commands a run tends to use to look around, answered from the files; anything else prints nothing. */
function bash(command: string, state: RunState): string {
  if (/\bgit\s+commit\b/.test(command)) {
    const had = state.changed.size
    commitAll(state)
    return had ? '[add-free-delivery 3c9e1d2] Update the banner' : 'nothing to commit, working tree clean'
  }
  if (/\bgit\s+status\b/.test(command)) {
    return state.changed.size ? `Changes not staged for commit:\n${[...state.changed].map(f => `\tmodified:   ${f}`).join('\n')}` : 'nothing to commit, working tree clean'
  }
  if (/\bgit\s+log\b/.test(command)) return '8b1e4a0 Add the free delivery banner'
  const cat = /\bcat\s+(\S+)/.exec(command)
  if (cat) return state.files[relative(cat[1]!)] ?? `cat: ${cat[1]}: No such file or directory`
  if (/^\s*(ls|find|tree)\b/.test(command)) return Object.keys(state.files).sort().join('\n')
  return ''
}

export function answerTaskRun(name: string, input: unknown, setup: TaskRunSetup, state: RunState): unknown {
  const args = (input && typeof input === 'object' ? input : {}) as Args
  switch (name) {
    case 'read_file': return readFile(args, state)
    case 'glob_files': return Object.keys(state.files).map(f => `${WORKING_FOLDER}/${f}`).join('\n')
    case 'grep_files': {
      const pattern = str(args.pattern).toLowerCase()
      const hits = Object.entries(state.files).filter(([, text]) => text.toLowerCase().includes(pattern)).map(([f]) => `${WORKING_FOLDER}/${f}`)
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
    case 'run_task': return refused(OWN_TASK)
    case 'get_task_details':
      return { taskId: SHOP_TASK.id, taskKey: SHOP_TASK.key, title: SHOP_TASK.title, description: SHOP_TASK.description, status: 'IN_PROGRESS', column: 'In progress', comments: setup.newComments ?? [] }
    case 'ping': return { pong: true }
    default: return { ok: true }
  }
}
