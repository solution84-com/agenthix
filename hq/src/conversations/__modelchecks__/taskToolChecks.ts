/**
 * The checks of the agents' task, board and sprint tools (tasks, runs, boards and routines spec, *What changes*,
 * Agents' tools): their words read once on the baseline model. Moving a task is update_task by its state or column,
 * never a run; planning into the current sprint names that sprint's id as list_boards lists it; showing a board is
 * open_board; and none of it starts work.
 */
import type { Check, Grade } from './checks'
import type { RunRecord } from './run'
import { CURRENT_SPRINT, OTHER_TASK, TASK } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

const argsOf = (input: unknown): Record<string, unknown> => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const STARTS = new Set(['start_work', 'run_task', 'set_task_schedule'])
const names = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((s): s is string => typeof s === 'string').map(s => s.trim().toUpperCase())

function startedNothing(run: RunRecord): Grade | null {
  const started = run.calls.find(c => STARTS.has(c.name))
  return started ? fail(`started work: ${calls(run)}`) : null
}

export const TASK_TOOL_CHECKS: readonly Check[] = [
  {
    id: 'task-move-done',
    title: 'Saying a task is done moves it to Done, and starts nothing',
    setup: { home: 'project', message: `${TASK.key} is finished, please mark it as done.` },
    grade(run) {
      const moved = run.calls.find(c => c.name === 'update_task' && names(argsOf(c.input).taskId).some(n => n === TASK.key || n === TASK.id.toUpperCase()))
      if (!moved) return fail(`no update_task on ${TASK.key}: ${calls(run)}`)
      const a = argsOf(moved.input)
      if (a.state !== 'DONE' && typeof a.columnId !== 'string') return fail(`update_task did not set the state or a column: ${JSON.stringify(a)}`)
      return startedNothing(run) ?? PASS
    },
  },
  {
    id: 'tasks-into-sprint',
    title: 'Planning tasks into the current sprint names its id, as list_boards lists it',
    setup: { home: 'project', message: `Put ${TASK.key} and ${OTHER_TASK.key} into the current sprint.` },
    grade(run) {
      const planned = run.calls.filter(c => (c.name === 'change_tasks' || c.name === 'update_task') && argsOf(c.input).sprintId !== undefined)
      if (planned.length === 0) return fail(`no sprint set: ${calls(run)}`)
      if (planned.some(c => argsOf(c.input).sprintId !== CURRENT_SPRINT.id)) return fail(`planned into ${String(argsOf(planned[0]!.input).sprintId)}, not ${CURRENT_SPRINT.id}`)
      const covered = new Set(planned.flatMap(c => names(c.name === 'change_tasks' ? argsOf(c.input).taskIds : argsOf(c.input).taskId)))
      for (const key of [TASK.key, OTHER_TASK.key]) if (!covered.has(key)) return fail(`${key} was not planned: ${calls(run)}`)
      return startedNothing(run) ?? PASS
    },
  },
  {
    id: 'board-open',
    title: 'Asking to look at the board together shows it with open_board',
    setup: { home: 'project', message: "Let's go through the board together." },
    grade(run) {
      if (!run.calls.some(c => c.name === 'open_board')) return fail(`no open_board: ${calls(run)}`)
      const changed = run.calls.find(c => ['update_task', 'change_tasks', 'create_task', 'create_board'].includes(c.name))
      if (changed) return fail(`changed something while only asked to look: ${calls(run)}`)
      return startedNothing(run) ?? PASS
    },
  },
  {
    id: 'task-new-backlog',
    title: 'A task for later is created, and nothing starts it',
    setup: { home: 'project', message: 'Add a task to write the release notes. No rush, it can wait.' },
    grade(run) {
      const made = run.calls.find(c => c.name === 'create_task')
      if (!made) return fail(`no create_task: ${calls(run)}`)
      const a = argsOf(made.input)
      if (typeof a.when === 'string' && a.when.trim().toLowerCase() !== 'later') return fail(`create_task asked for "${a.when}", not later`)
      if (a.state !== undefined && a.state !== 'BACKLOG') return fail(`created it in ${String(a.state)}, not Backlog`)
      return startedNothing(run) ?? PASS
    },
  },
]
