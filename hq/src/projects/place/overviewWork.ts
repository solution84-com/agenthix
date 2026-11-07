import { doneRecently, groupTasks, taskAction, taskStateText, type ToolTask, type TaskAction } from '@agenthix/ui/tasks'

/** How many rows each list of the overview shows; the Tasks tool has the rest. */
export const OVERVIEW_ROWS = 3

export interface OverviewRow {
  key: string
  title: string
  state: string
  tone: 'needs' | 'live' | 'muted'
  /** The one next step a task that needs the person offers. */
  action: TaskAction | null
  /** The first line of the result, for a finished task. */
  result: string | null
}

export interface OverviewWork {
  needsYou: OverviewRow[]
  running: OverviewRow[]
  upNext: OverviewRow[]
  /** How many are in the list in all, where only some are shown. */
  upNextTotal: number
  finished: OverviewRow[]
  total: number
}

/** A result's first line that says something: Markdown marks and blank lines left out. */
export function firstLine(result: string | null): string | null {
  for (const raw of (result ?? '').split('\n')) {
    const line = raw.replace(/^[\s>#*_`-]+/, '').replace(/[*_`]+$/, '').trim()
    if (line) return line
  }
  return null
}

function row(t: ToolTask, now: Date): OverviewRow {
  const { text, tone } = taskStateText(t, now)
  return { key: t.key, title: t.title, state: text, tone, action: taskAction(t), result: null }
}

/** The member's overview of the work: what needs them, what is running, what is next, what just finished. */
export function overviewWork(tasks: ToolTask[], now: Date): OverviewWork {
  const groups = groupTasks(tasks)
  return {
    needsYou: groups.needsYou.map(t => row(t, now)),
    running: groups.workingOn.map(t => row(t, now)),
    upNext: groups.upNext.slice(0, OVERVIEW_ROWS).map(t => row(t, now)),
    upNextTotal: groups.upNext.length,
    finished: doneRecently(tasks, now).slice(0, OVERVIEW_ROWS).map(t => ({
      ...row(t, now), state: 'Done', tone: 'muted' as const, result: firstLine(t.result),
    })),
    total: tasks.length,
  }
}
