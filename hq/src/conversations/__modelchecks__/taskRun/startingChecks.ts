/**
 * The checks of the tools that start work and make routines (tasks, runs, boards and routines spec, D6, D7, D15, N6;
 * adr-0175, adr-0177): their words read once on the baseline model, in a task's run. Work starts only when the person
 * asked: a follow-up task is made and left for a person, a task the person asked to start is started with run_task
 * (never the run's own task), a routine is a cron rule with an agent and instructions, and switching one off changes
 * nothing else.
 */
import type { Check, Grade } from '../checks'
import type { RecordedCall, RunRecord } from '../run'
import { KERNEL, MORNING_ROUTINE, NEXT_TASK, SHOP_PROJECT, SHOP_TASK } from './world'
import { FOLD_CHECKS } from './foldChecks'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
const argsOf = (c: RecordedCall): Record<string, unknown> => (c.input && typeof c.input === 'object' ? (c.input as Record<string, unknown>) : {})
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const names = (v: unknown, t: { id: string; key: string }) => text(v) === t.id || text(v).toUpperCase() === t.key

/** No run_task on the run's own task, and no task created asked to start. */
function startedNothingUnasked(run: RunRecord, allowed: { id: string; key: string } | null): Grade | null {
  const ran = run.calls.find(c => c.name === 'run_task' && !(allowed && names(argsOf(c).taskId, allowed)))
  if (ran) return fail(`run_task on ${text(argsOf(ran).taskId) || 'its own task'}: ${calls(run)}`)
  const queued = run.calls.find(c => c.name === 'create_task' && argsOf(c).queue === true)
  if (queued) return fail(`create_task asked to start (queue: true): ${calls(run)}`)
  if (run.calls.some(c => c.name === 'set_task_schedule')) return fail(`set a start time nobody asked for: ${calls(run)}`)
  return null
}

const ROUTINE_KEYS = new Set(['title', 'agentId', 'instructions', 'cron', 'timezone', 'modelChoice'])

export const STARTING_CHECKS: readonly Check[] = [
  {
    id: 'taskrun-follow-up-not-started',
    title: 'A follow-up for later is made as a task, and nothing starts it',
    taskRun: { openLivePreview: null, brief: 'Note a follow-up: the checkout page needs the same free-delivery banner. It can wait; do not do it now.' },
    grade(run) {
      if (!run.calls.some(c => c.name === 'create_task')) return fail(`no create_task: ${calls(run)}`)
      if (run.calls.some(c => c.name === 'create_routine')) return fail(`made a routine for a one-off: ${calls(run)}`)
      return startedNothingUnasked(run, null) ?? PASS
    },
  },
  {
    id: 'taskrun-start-asked',
    title: 'A task the person asked to start is started with run_task, and never the run\'s own',
    taskRun: { openLivePreview: null, brief: `Mia asked: once the banner is in, start ${NEXT_TASK.key} (${NEXT_TASK.title}) as well, now.` },
    grade(run) {
      const started = run.calls.find(c => c.name === 'run_task' && names(argsOf(c).taskId, NEXT_TASK))
      if (!started) return fail(`no run_task on ${NEXT_TASK.key}: ${calls(run)}`)
      if (run.calls.some(c => c.name === 'run_task' && names(argsOf(c).taskId, SHOP_TASK))) return fail(`run_task on its own task ${SHOP_TASK.key}: ${calls(run)}`)
      if (run.calls.some(c => c.name === 'create_task')) return fail(`created a task instead of starting ${NEXT_TASK.key}: ${calls(run)}`)
      return startedNothingUnasked(run, NEXT_TASK) ?? PASS
    },
  },
  {
    id: 'taskrun-routine-weekdays',
    title: 'Every weekday at 9:00 is a routine: a cron rule, the agent and instructions, and no task',
    taskRun: {
      openLivePreview: null,
      brief: `Mia asked: set up a routine in ${SHOP_PROJECT.name} so that every weekday at 9:00 ${KERNEL.name} checks the ` +
        'banner still shows on the home page and comments if it does not. Nothing else.',
    },
    grade(run) {
      const made = run.calls.find(c => c.name === 'create_routine')
      if (!made) return fail(`no create_routine: ${calls(run)}`)
      const a = argsOf(made)
      if (text(a.cron).replace(/\s+/g, ' ') !== '0 9 * * 1-5') return fail(`cron is "${text(a.cron)}", not "0 9 * * 1-5"`)
      if (!names(a.projectId, SHOP_PROJECT)) return fail(`projectId is "${text(a.projectId)}", not ${SHOP_PROJECT.key}`)
      if (text(a.agentId) !== KERNEL.id) return fail(`agentId is "${text(a.agentId)}", not ${KERNEL.id}`)
      if (!/banner/i.test(text(a.instructions))) return fail(`its instructions do not say what to check: "${text(a.instructions)}"`)
      if (run.calls.some(c => c.name === 'create_task')) return fail(`made a task for a routine: ${calls(run)}`)
      return startedNothingUnasked(run, null) ?? PASS
    },
  },
  {
    id: 'taskrun-routine-off',
    title: 'Switching a routine off is update_routine with enabled false, and changes nothing else',
    taskRun: { openLivePreview: null, brief: `Mia asked: switch off the routine "${MORNING_ROUTINE.title}" (its id is ${MORNING_ROUTINE.id}) for now. Keep everything else about it as it is.` },
    grade(run) {
      const changed = run.calls.filter(c => c.name === 'update_routine')
      if (changed.length === 0) return fail(`no update_routine: ${calls(run)}`)
      const off = changed.find(c => text(argsOf(c).routineId) === MORNING_ROUTINE.id && argsOf(c).enabled === false)
      if (!off) return fail(`no update_routine on ${MORNING_ROUTINE.id} with enabled false: ${JSON.stringify(changed.map(argsOf))}`)
      const more = Object.keys(argsOf(off)).filter(k => ROUTINE_KEYS.has(k) && argsOf(off)[k] !== undefined)
      if (more.length) return fail(`also changed ${more.join(', ')}`)
      if (run.calls.some(c => c.name === 'create_routine')) return fail(`made a routine: ${calls(run)}`)
      return startedNothingUnasked(run, null) ?? PASS
    },
  },
  // A tool the run is not shown, found and used (foldChecks.ts).
  ...FOLD_CHECKS,
]
