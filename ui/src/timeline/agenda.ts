/** The agenda a narrow timeline becomes: This week · Next week · Later, each line a task with its date (spec §3). Pure. */
import { DAY_MS, dayOf, formatDay, formatLocalDay, formatTime, mondayOf } from './layout'
import type { TimelineData, TimelineTaskData } from './types'

export interface AgendaLine { task: TimelineTaskData; date: string }
export interface AgendaGroup { label: 'This week' | 'Next week' | 'Later'; lines: AgendaLine[] }

interface Dated { task: TimelineTaskData; from: number; to: number; date: string }

function dated(task: TimelineTaskData): Dated | null {
  const start = task.planStart ?? task.planFinish
  const finish = task.planFinish ?? task.planStart
  if (start && finish) {
    const from = dayOf(start)
    const to = dayOf(finish)
    return { task, from, to, date: from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}` }
  }
  const at = task.startAt
  if (at) return { task, from: dayOf(at), to: dayOf(at), date: `starts ${formatLocalDay(at)}, ${formatTime(at)}` }
  return null
}

/**
 * Tasks that are, or will be, under way from the week of `today`: a plan that is
 * still running counts for this week; one wholly past is left out; undated tasks
 * are not on the timeline.
 */
export function agendaGroups(data: TimelineData, today: number): AgendaGroup[] {
  const thisWeek = mondayOf(today)
  const nextWeek = thisWeek + 7 * DAY_MS
  const later = nextWeek + 7 * DAY_MS
  const groups: AgendaGroup[] = [
    { label: 'This week', lines: [] }, { label: 'Next week', lines: [] }, { label: 'Later', lines: [] },
  ]
  const items = data.tasks.map(dated).filter((d): d is Dated => !!d && d.to >= thisWeek)
  items.sort((a, b) => a.from - b.from)
  for (const item of items) {
    const line = { task: item.task, date: item.date }
    if (item.from < nextWeek) groups[0]!.lines.push(line)
    else if (item.from < later) groups[1]!.lines.push(line)
    else groups[2]!.lines.push(line)
  }
  return groups
}
