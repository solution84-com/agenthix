import { taskStateText, type StateTone } from '../tasks/taskGroups'
import { runNeedsPerson } from '../tasks/runState'
import type { BoardCardData } from './types'

const validDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const iso = (v: string | Date | null | undefined): string | null => validDate(v)?.toISOString() ?? null

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The words a card shows for where its task stands ("Needs you", "Running · 12 min", "Not started", "Done Tue"). */
export function cardStateText(card: BoardCardData, now: Date): { text: string; tone: StateTone } {
  if (card.status === 'DONE' && card.runState !== 'RUN_BLOCKED') {
    const done = validDate(card.doneAt)
    return { text: done ? `Done ${WEEKDAYS[done.getDay()]}` : 'Done', tone: 'muted' }
  }
  const quiet = card.runState === 'RUN_NONE' && !card.needsYou && !card.scheduleNextDueAt
  if (quiet && card.column === null) return { text: 'Not started', tone: 'muted' }
  return taskStateText({
    id: card.id, key: card.taskKey, title: card.title, priority: card.priority as 'LOW' | 'MEDIUM' | 'HIGH', status: card.status,
    runState: card.runState, runStateReason: card.runStateReason, agent: null, board: null, columnLabel: null, project: null,
    waitsForAgent: card.needsYou && !runNeedsPerson(card.runState),
    startsAt: iso(card.scheduleNextDueAt),
    workingSince: card.runState === 'RUN_ACTIVE' ? iso(card.lastWorkedAt ?? card.updatedAt) : null,
    doneAt: iso(card.doneAt), result: null, createdAt: iso(card.createdAt) ?? '',
  }, now)
}

/** "Backlog 3 · To do 4 · In progress 2": the counts under a board's bar. */
export function countsLine(backlogCount: number, columns: { label: string; count: number }[]): string {
  return [`Backlog ${backlogCount}`, ...columns.map(c => `${c.label} ${c.count}`)].join(' · ')
}

/** "6–20 Oct", or "30 Sep – 13 Oct" across months. */
export function sprintDates(start: string | Date | null | undefined, finish: string | Date | null | undefined): string {
  if (!start || !finish) return ''
  const a = new Date(start)
  const b = new Date(finish)
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const day = (d: Date) => d.getUTCDate()
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${day(a)}–${day(b)} ${month(b)}`
    : `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`
}

export function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return 'ends today'
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`
}
