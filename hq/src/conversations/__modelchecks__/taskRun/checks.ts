/**
 * The checks of a task's run on a branch (W7, W12–W14 of the live preview walk). With its branch's live preview
 * running, a run asked to change what the app shows looks at the apps first, changes the file, commits it itself and
 * reloads the view, and leaves the person's live-preview workflows and its own task alone. With none open, it opens one
 * only when the person asked for the app, and never for HQ's own request after a merge clash.
 */
import { isLivePreviewWorkflowName } from '@agenthix/core'
import { clashAskText } from '../../../branches/clashAsk'
import type { Check, Grade } from '../checks'
import type { RecordedCall, RunRecord } from '../run'
import { RUNNING, SHOP_TASK, WORKING_FOLDER } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
/** The calls in order, each command a run ran shown in short, so a failure says what it did instead. */
const calls = (run: RunRecord): string => run.calls.map(c => {
  const command = c.name === 'bash' ? String((c.input as { command?: unknown } | null)?.command ?? '') : ''
  return command ? `bash(${command.slice(0, 40)})` : c.name
}).join(', ') || 'no tool call'
const named = (c: RecordedCall): string => {
  const a = c.input && typeof c.input === 'object' ? (c.input as Record<string, unknown>) : {}
  return typeof a.name === 'string' ? a.name : ''
}

const EDITS = new Set(['edit_file', 'write_file'])
/** An edit on the branch: a file in the working folder, or a path relative to it. Files outside it are not committed. */
const onBranch = (c: RecordedCall): boolean => {
  const p = String((c.input as { file_path?: unknown } | null)?.file_path ?? '')
  return !p.startsWith('/') || p.startsWith(`${WORKING_FOLDER}/`)
}
const isCommit = (c: RecordedCall) => c.name === 'commit' ||
  (c.name === 'bash' && /\bgit\s+commit\b/.test(String((c.input as { command?: unknown } | null)?.command ?? '')))
const at = (run: RunRecord, test: (c: RecordedCall) => boolean): number => run.calls.findIndex(test)
const lastAt = (run: RunRecord, test: (c: RecordedCall) => boolean): number => run.calls.map(test).lastIndexOf(true)

/** What every task run on a branch keeps to: the person's live-preview workflows and its own task are not its own. */
function keptOut(run: RunRecord): Grade | null {
  const workflow = run.calls.find(c => c.name === 'run_workflow' && isLivePreviewWorkflowName(named(c)))
  if (workflow) return fail(`ran the live preview's own workflow ${named(workflow)}: ${calls(run)}`)
  if (run.calls.some(c => c.name === 'run_task')) return fail(`called run_task from its own task's run: ${calls(run)}`)
  return null
}

/** Changed the file, then committed it itself after its last change. */
function committedItsWork(run: RunRecord): Grade | null {
  const lastEdit = lastAt(run, c => EDITS.has(c.name) && onBranch(c))
  if (lastEdit < 0) return fail(`changed no file: ${calls(run)}`)
  const commit = lastAt(run, isCommit)
  if (commit < lastEdit) return fail(`did not commit after its last change: ${calls(run)}`)
  return null
}

function steeredTheApp(run: RunRecord): Grade {
  const out = keptOut(run) ?? committedItsWork(run)
  if (out) return out
  const list = at(run, c => c.name === 'list_apps')
  if (list < 0) return fail(`never called list_apps: ${calls(run)}`)
  const firstApp = at(run, c => c.name === 'start_app' || c.name === 'reload_view')
  if (firstApp >= 0 && firstApp < list) return fail(`acted on the app before list_apps: ${calls(run)}`)
  const commit = lastAt(run, isCommit)
  const shown = lastAt(run, c => c.name === 'reload_view' || c.name === 'start_app')
  if (shown < commit) return fail(`did not reload_view (or restart the app) after committing: ${calls(run)}`)
  return PASS
}

function openedNone(run: RunRecord): Grade {
  const out = keptOut(run)
  if (out) return out
  if (run.calls.some(c => c.name === 'start_app')) return fail(`called start_app, opening a live preview nobody asked for: ${calls(run)}`)
  return PASS
}

const ORANGE = 'Make the free-delivery banner orange and add "– this week only" after it. I have the live preview open, show me there.'

export const TASK_RUN_CHECKS: readonly Check[] = [
  {
    id: 'taskrun-steer-app',
    title: 'With the live preview running, a run changes the app, commits it and reloads the view',
    taskRun: { openLivePreview: RUNNING, brief: ORANGE },
    grade: steeredTheApp,
  },
  {
    id: 'taskrun-steer-app-comment',
    title: 'The same ask as a comment on the task: list_apps first, commit, reload_view',
    taskRun: { openLivePreview: RUNNING, newComments: [{ author: 'Mia Novak', text: ORANGE }] },
    grade: steeredTheApp,
  },
  {
    id: 'taskrun-clash-no-app',
    title: 'HQ\'s own request after a merge clash never opens a live preview',
    taskRun: {
      openLivePreview: null,
      behindMain: 3,
      newComments: [{ author: 'Mia Novak', text: clashAskText('add-free-delivery-over-50-banner-to-shop-s-home', 'main', [{ path: 'package.json', version: null }]) }],
    },
    grade: openedNone,
  },
  {
    id: 'taskrun-no-preview-not-asked',
    title: 'With none open, a change nobody asked to see opens no live preview, and is committed',
    taskRun: { openLivePreview: null, brief: `On ${SHOP_TASK.key}, change the banner to say "Free delivery on orders over $50".` },
    grade(run) {
      const none = openedNone(run)
      return none.passed ? committedItsWork(run) ?? PASS : none
    },
  },
  {
    id: 'taskrun-no-preview-asked',
    title: 'With none open, a person asking to see the app gets it started',
    taskRun: { openLivePreview: null, brief: 'Start the shop app so I can click through the banner.' },
    grade(run) {
      const out = keptOut(run)
      if (out) return out
      return run.calls.some(c => c.name === 'start_app') ? PASS : fail(`no start_app: ${calls(run)}`)
    },
  },
]
