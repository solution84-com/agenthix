/**
 * A task's state, in the one set of words every place uses (T1): the Tasks list, a board card, the task page's
 * header, the Runs tab and the Runs badge's tooltip. Each state that needs the reader has exactly one next step.
 *
 * Needs your okay · Asked you something · Failed · <short reason> · Running · N min · Waiting · Not started ·
 * Finished · Done. A task that waits on someone else reads Waiting, with whom: "Waiting · needs Sam Okafor's okay".
 */
import { durationText, plainReason, type StateTone } from './taskGroups'

/** Stored on a task blocked for a tool request (hq's taskExecutionReasons): it waits for an okay. */
const APPROVAL_REASON = 'Awaiting tool approval'

export type TaskStateKind = 'okay' | 'question' | 'failed' | 'running' | 'waiting' | 'notStarted' | 'finished' | 'done'

export type TaskNextStep = 'review' | 'answer' | 'runAgain'

/** What waits for a person: an approval or a question, for the reader or for someone they can name. */
export type TaskWaitsOn = { what: 'okay' | 'answer'; who: 'you' | { name: string } }

export type TaskStateInput = {
  runState: string
  runStateReason?: string | null
  /** It is in a done column (its status is DONE). */
  done: boolean
  /** What waits for a person on it, when something does. */
  waitsOn?: TaskWaitsOn | null
  /** When its running run started. */
  workingSince?: string | Date | null
  /** Its latest run completed (worked out from its runs): with nothing queued, it is Finished. */
  latestRunCompleted?: boolean
}

export type TaskStateWords = {
  kind: TaskStateKind
  /** What the row, chip or header says. */
  text: string
  tone: StateTone
  /** A failure's full sentence, for its tooltip and the task page; null otherwise. */
  fullReason: string | null
  nextStep: TaskNextStep | null
  /** The next step's button: Review, Answer, Run again. */
  nextStepLabel: string | null
}

export const TASK_STATE_WORDS: Record<TaskStateKind, string> = {
  okay: 'Needs your okay',
  question: 'Asked you something',
  failed: 'Failed',
  running: 'Running',
  waiting: 'Waiting',
  notStarted: 'Not started',
  finished: 'Finished',
  done: 'Done',
}

const NEXT_STEP_LABELS: Record<TaskNextStep, string> = { review: 'Review', answer: 'Answer', runAgain: 'Run again' }

/** The words before the first dash or full stop of a reason: "model overloaded", for "Model overloaded — retry later". */
function shortReason(reason: string): string {
  const plain = plainReason(reason)
  const cut = plain.split(/ — |\. |: /)[0].trim()
  const short = cut.length > 40 ? `${cut.slice(0, 39).trimEnd()}…` : cut
  return short.charAt(0).toLowerCase() + short.slice(1)
}

function words(kind: TaskStateKind, tone: StateTone, extra: { text?: string; fullReason?: string | null; nextStep?: TaskNextStep | null } = {}): TaskStateWords {
  const nextStep = extra.nextStep ?? null
  return {
    kind, tone,
    text: extra.text ?? TASK_STATE_WORDS[kind],
    fullReason: extra.fullReason ?? null,
    nextStep,
    nextStepLabel: nextStep ? NEXT_STEP_LABELS[nextStep] : null,
  }
}

function waitingOnSomeone(waitsOn: TaskWaitsOn & { who: { name: string } }): TaskStateWords {
  return words('waiting', 'muted', { text: `Waiting · needs ${waitsOn.who.name}’s ${waitsOn.what === 'okay' ? 'okay' : 'answer'}` })
}

export function taskStateWords(t: TaskStateInput, now: Date = new Date()): TaskStateWords {
  if (t.done) return words('done', 'muted')
  const waitsOn = t.waitsOn ?? (t.runState === 'RUN_BLOCKED' && t.runStateReason?.startsWith(APPROVAL_REASON) ? { what: 'okay' as const, who: 'you' as const } : null)
  if (waitsOn) {
    if (waitsOn.who !== 'you') return waitingOnSomeone({ ...waitsOn, who: waitsOn.who })
    return waitsOn.what === 'okay'
      ? words('okay', 'needs', { nextStep: 'review' })
      : words('question', 'needs', { nextStep: 'answer' })
  }
  if (t.runState === 'RUN_FAILED' || t.runState === 'RUN_BLOCKED') {
    const reason = t.runStateReason?.trim() || null
    return words('failed', 'needs', {
      text: reason ? `${TASK_STATE_WORDS.failed} · ${shortReason(reason)}` : TASK_STATE_WORDS.failed,
      fullReason: reason ? plainReason(reason) : null,
      nextStep: 'runAgain',
    })
  }
  if (t.runState === 'RUN_ACTIVE') {
    const since = t.workingSince ? ` · ${durationText(now.getTime() - new Date(t.workingSince).getTime())}` : ''
    return words('running', 'live', { text: `${TASK_STATE_WORDS.running}${since}` })
  }
  if (t.runState === 'RUN_QUEUED' || t.runState === 'RUN_THROTTLED') return words('waiting', 'muted')
  if (t.latestRunCompleted) return words('finished', 'muted')
  return words('notStarted', 'muted')
}
