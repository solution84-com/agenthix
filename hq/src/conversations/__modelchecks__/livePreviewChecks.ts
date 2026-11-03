/**
 * The checks of the lead's live-preview offer (live preview spec section 4, *Opening one*): when the person asks to
 * see the app of a code workspace running, the lead offers a live preview with `offer_live_preview`, on the task's
 * branch when the work was done on a task, and on main otherwise; it never starts an app itself or in background work.
 * A question that is not about seeing the app gets no offer. An ask to start or change the app goes to the work on the
 * branch, which has the app tools: in a task's thread a run of the task with the ask as its brief, even when the task is
 * done; in a conversation started in a code workspace, work in its place. The lead never says it can't be started.
 */
import type { Check, Grade } from './checks'
import type { RunRecord } from './run'
import { CODE_WORKSPACE, TASK } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
const OFFER = 'offer_live_preview'

const argsOf = (input: unknown): Record<string, unknown> => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'

function offered(run: RunRecord, task: string | null): Grade {
  const started = run.calls.find(c => c.name === 'start_work' || c.name === 'create_task' || c.name === 'run_task')
  if (started) return fail(`started work instead of offering a live preview: ${calls(run)}`)
  const offer = run.calls.find(c => c.name === OFFER)
  if (!offer) return fail(`no ${OFFER}: ${calls(run)}`)
  const a = argsOf(offer.input)
  if (a.workspaceId !== CODE_WORKSPACE.id) return fail(`offered ${String(a.workspaceId ?? 'no workspace')}, not ${CODE_WORKSPACE.name}`)
  const named = typeof a.task === 'string' && a.task.trim() ? a.task.trim().toUpperCase() : null
  if (named !== task) return fail(`offered ${named ?? 'main'}, not ${task ?? 'main'}`)
  return PASS
}

/** The words of a lead that turns the person away instead of passing the ask on. */
const CANT = /\b(?:can(?:no|')t|unable to|not able to) (?:start|run|launch)\b|\bdon'?t have (?:a |the )?start_app\b|\bno start_app\b|\b(?:start|run) it yourself\b/i

function turnedAway(run: RunRecord): Grade | null {
  const words = run.texts.join(' ')
  return CANT.test(words) ? fail(`said the app can't be started: "${words.slice(0, 200)}"`) : null
}

/** run_task on the thread's own task, with a brief that carries the person's ask. */
function taskRunWith(run: RunRecord, asked: RegExp): Grade {
  const call = run.calls.find(c => c.name === 'run_task')
  if (!call) return fail(`no run_task: ${calls(run)}`)
  const a = argsOf(call.input)
  const named = typeof a.taskId === 'string' ? a.taskId.trim().toUpperCase() : ''
  if (named && named !== TASK.key && named !== TASK.id.toUpperCase()) return fail(`ran ${named}, not ${TASK.key}`)
  const brief = typeof a.brief === 'string' ? a.brief : ''
  if (!asked.test(brief)) return fail(`run_task's brief does not carry the ask: "${brief.slice(0, 160)}"`)
  return turnedAway(run) ?? PASS
}

const DONE_ON_BRANCH = [
  { role: 'person' as const, text: `Is ${TASK.key} finished?` },
  { role: 'agent' as const, text: `Yes: ${TASK.key} is done. The sign-up form is fixed and committed on its branch in ${CODE_WORKSPACE.name}.` },
]

const CHECKS_WITH_IT_ON: readonly Check[] = [
  {
    id: 'preview-task-branch',
    title: 'Seeing a task\'s work running is a live preview of its branch',
    setup: {
      home: 'project',
      before: [
        { role: 'person', text: `How is ${TASK.key} going?` },
        { role: 'agent', text: `${TASK.key} is done: the sign-up form is fixed on its branch in ${CODE_WORKSPACE.name}.` },
      ],
      message: 'Great, can I try the sign-up form running?',
    },
    grade: run => offered(run, TASK.key),
  },
  {
    id: 'preview-main',
    title: 'Seeing the app running is a live preview of main',
    setup: { home: 'project', message: `Show me ${CODE_WORKSPACE.name} running, I want to click around.` },
    grade: run => offered(run, null),
  },
  {
    id: 'preview-not-asked',
    title: 'No live preview when the person did not ask to see the app',
    setup: { home: 'project', message: "What's our release process?" },
    grade: run => (run.calls.some(c => c.name === OFFER) ? fail(`offered a live preview unasked: ${calls(run)}`) : PASS),
  },
  {
    id: 'thread-start-app',
    title: 'In a done task\'s thread, starting the app is a run of the task',
    setup: { home: 'task', before: DONE_ON_BRANCH, message: 'Start the app so I can click through the sign-up form.' },
    grade: run => taskRunWith(run, /\b(?:app|start|run|server)/i),
  },
  {
    id: 'thread-change-app',
    title: 'In a done task\'s thread, changing what the app shows is a run of the task',
    setup: { home: 'task', before: DONE_ON_BRANCH, message: 'Make the banner say 40% off, and reload it so I can see.' },
    grade: run => taskRunWith(run, /banner|40/i),
  },
  {
    id: 'workspace-start-app',
    title: 'In a conversation started in a code workspace, starting the app is work, never a refusal',
    setup: {
      home: 'project',
      workspace: { name: CODE_WORKSPACE.name, git: true },
      before: [
        { role: 'person', text: 'Add a login page.' },
        { role: 'agent', text: 'The login page is done and committed on this conversation\'s branch.' },
      ],
      message: 'Start the app so I can try the login page.',
    },
    grade(run) {
      const work = run.calls.find(c => ['start_work', 'run_task', 'create_task', OFFER].includes(c.name))
      if (!work) return fail(`passed the ask on to no work: ${calls(run)}`)
      return turnedAway(run) ?? PASS
    },
  },
]

/** The live preview's own checks, with its flag on (adr-0172). */
export const LIVE_PREVIEW_CHECKS: readonly Check[] = CHECKS_WITH_IT_ON.map(c => (c.setup ? { ...c, setup: { ...c.setup, features: ['livePreview'] } } : c))
