import type { ReactNode } from 'react'
import { Plus, Square } from 'lucide-react'
import { Button, dayLabel } from '@agenthix/ui/primitives'
import type { OverflowItem } from '@agenthix/ui/tasks'
import type { PhoneAction } from '../../shared/layouts/phoneActions'
import { TaskRunButton } from './TaskRunAt'
import type { HeaderButton } from './taskPageState'

export const ASSIGN_AN_AGENT_FIRST = 'Assign an agent first'

/** What the page's actions are drawn from. */
export interface TaskPageActionsInput {
  isEpic: boolean
  button: HeaderButton
  /** Why it cannot be run, or a task added under it: a Viewer, no agent. */
  refusal?: string
  /** Why its run cannot be stopped: a Viewer. */
  stopRefusal?: string
  busy: boolean
  /** A request's card is on the page, with its own filled Approve. */
  requestShown: boolean
  talk: { label: string; open: () => void; refusal?: string } | null
  menu: OverflowItem[]
  on: { runNow: () => void; runAt: () => void; stop: () => void; review: () => void; addTask: () => void }
}

const SECOND_WORD: Record<'review' | 'answer', string> = { review: 'Review', answer: 'Answer' }

/**
 * The page's one filled button (TK1, D6): Add a task on an epic (never Run: an epic is never run), Run ▾ (Run now,
 * Run at…), Stop, Run again, and Review or Answer, which take the person to Now. While a request's card shows its
 * own Approve, Review is outlined so the page keeps one filled button. Null where the state has none.
 */
export function taskPrimary(a: TaskPageActionsInput): ReactNode {
  if (a.isEpic) {
    return <Button leadingIcon={<Plus size={14} aria-hidden />} disabled={!!a.refusal} title={a.refusal} onClick={a.on.addTask}>Add a task</Button>
  }
  switch (a.button) {
    case 'run':
      return <TaskRunButton disabledWhy={a.refusal} busy={a.busy} onRunNow={a.on.runNow} onRunAt={a.on.runAt} />
    case 'stop':
      return (
        <Button leadingIcon={<Square size={12} aria-hidden />} disabled={!!a.stopRefusal || a.busy} title={a.stopRefusal} onClick={a.on.stop}>Stop</Button>
      )
    case 'runAgain':
      return <Button disabled={!!a.refusal || a.busy} title={a.refusal} onClick={a.on.runNow}>Run again</Button>
    case 'review':
    case 'answer':
      return <Button variant={a.requestShown ? 'secondary' : 'primary'} onClick={a.on.review}>{SECOND_WORD[a.button]}</Button>
    default:
      return null
  }
}

/**
 * The same actions behind the phone top bar's ⋯ (spec, *The phone*): the main one first (Run now and Run at…, Stop,
 * Review, Add a task), then Talk about this task, then ⋯'s own items.
 */
export function taskPhoneActions(a: TaskPageActionsInput): PhoneAction[] {
  const main: PhoneAction[] = a.isEpic
    ? [{ label: 'Add a task', onSelect: a.on.addTask, disabledWhy: a.refusal }]
    : a.button === 'run'
      ? [
          { label: 'Run now', onSelect: a.on.runNow, disabledWhy: a.refusal },
          { label: 'Run at…', hint: 'a date and time', onSelect: a.on.runAt, disabledWhy: a.refusal },
        ]
      : a.button === 'stop' ? [{ label: 'Stop', onSelect: a.on.stop, disabledWhy: a.stopRefusal }]
        : a.button === 'runAgain' ? [{ label: 'Run again', onSelect: a.on.runNow, disabledWhy: a.refusal }]
          : a.button === 'review' || a.button === 'answer' ? [{ label: SECOND_WORD[a.button], onSelect: a.on.review }]
            : []
  return [
    ...main,
    ...(a.talk ? [{ label: a.talk.label, onSelect: a.talk.open, disabledWhy: a.talk.refusal }] : []),
    ...a.menu.filter(i => !i.phoneOnly && !(a.button === 'runAgain' && i.label === 'Run again')).map(i => ({
      label: i.label, hint: i.hint, danger: i.danger, disabledWhy: i.disabledReason, onSelect: () => void i.onSelect(),
    })),
  ]
}

/** The folded Details' one line on a phone: "Writer · Sprint 4 · High · 12 Nov"; an epic's "High · due 20 Nov". */
export function taskDetailsSummary(task: {
  isEpic?: boolean; priority: string; planFinish?: string | Date | null; assignedAgent: { name: string } | null
}, sprint: string | null, now: Date): string {
  const priority = task.priority.charAt(0) + task.priority.slice(1).toLowerCase()
  const due = task.planFinish ? dayLabel(new Date(task.planFinish), now) : null
  return [
    task.isEpic ? null : task.assignedAgent?.name, sprint, priority, due ? (task.isEpic ? `due ${due}` : due) : null,
  ].filter(Boolean).join(' · ')
}
