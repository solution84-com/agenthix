import { DONE_WINDOW_MS } from '../doneWindow'

type CountedTask = { state?: string | null; archived?: boolean; doneAt?: Date | string | null }

/**
 * The Tasks entry's count (the shell kit's menu counts): the Tasks list's All — every task not archived that is open or
 * was done in the last 30 days. A count of tasks only, never a run state: what needs the person is in Runs.
 */
export function tasksCount(tasks: CountedTask[], now: Date = new Date()): string {
  const since = now.getTime() - DONE_WINDOW_MS
  return String(tasks.filter((t) => {
    if (t.archived) return false
    const done = t.state === 'DONE'
    return !done || (!!t.doneAt && new Date(t.doneAt).getTime() >= since)
  }).length)
}

/** The Runs tool's count: "2 running", or nothing while the project is quiet or its site cannot be asked. */
export function runsCount(runs: unknown[] | undefined): string | undefined {
  return runs && runs.length > 0 ? `${runs.length} running` : undefined
}

/** A place's boards: the two built-in ones, and each saved one (a row with `view`). */
export function boardsCount(boards: { view?: unknown }[]): number {
  return 2 + boards.filter(b => !!b.view).length
}
