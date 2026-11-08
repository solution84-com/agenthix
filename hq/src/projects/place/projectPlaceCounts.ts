import { needsPerson } from '@agenthix/ui/tasks'
import { waitsForAgent } from '../pages/toolTaskRows'

type CountedTask = { status: string; runState: string | null; runStateReason?: string | null; assignedAgentId?: string | null }

/** The Tasks tool's count (spec §3): how many need the person, then how many are open — "1 needs you · 12". */
export function tasksCount(tasks: CountedTask[]): { count: string; needsYou: boolean } {
  const open = tasks.filter((t) => t.status !== 'DONE')
  const needs = tasks.filter((t) => needsPerson({
    status: t.status, runState: t.runState,
    waitsForAgent: waitsForAgent({ runState: t.runState ?? 'RUN_NONE', runStateReason: t.runStateReason ?? null, assignedAgentId: t.assignedAgentId ?? null }),
  })).length
  return { count: needs > 0 ? `${needs} needs you · ${open.length}` : String(open.length), needsYou: needs > 0 }
}

/** The Runs tool's count: "2 running", or nothing while the project is quiet or its site cannot be asked. */
export function runsCount(runs: unknown[] | undefined): string | undefined {
  return runs && runs.length > 0 ? `${runs.length} running` : undefined
}

/** A place's boards: the two built-in ones, and each saved one (a row with `view`). */
export function boardsCount(boards: { view?: unknown }[]): number {
  return 2 + boards.filter(b => !!b.view).length
}
