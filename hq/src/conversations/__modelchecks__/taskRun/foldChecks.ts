/**
 * The checks of a tool a run is not shown (ADR-0193): asked for something only a folded tool does, the run finds it
 * with find_tools and calls it with use_tool, instead of saying it can't or doing something else. A call of a tool the
 * run was not shown is refused (run.ts), so a grade that finds the tool's call found it through use_tool.
 */
import { isLivePreviewWorkflowName } from '@agenthix/core'
import type { Check, Grade } from '../checks'
import type { RecordedCall, RunRecord } from '../run'
import { KERNEL, SHOP_PROJECT } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
const argsOf = (c: RecordedCall): Record<string, unknown> => (c.input && typeof c.input === 'object' ? (c.input as Record<string, unknown>) : {})
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'

/** Nothing started that nobody asked for. */
function startedNothing(run: RunRecord): Grade | null {
  if (run.calls.some(c => c.name === 'run_task')) return fail(`called run_task: ${calls(run)}`)
  if (run.calls.some(c => c.name === 'create_task' && argsOf(c).queue === true)) return fail(`started a task: ${calls(run)}`)
  return null
}

export const FOLD_CHECKS: readonly Check[] = [
  {
    id: 'taskrun-fold-routine',
    title: 'Asked for something every weekday, a run finds create_routine and calls it through use_tool',
    taskRun: {
      openLivePreview: null,
      brief: `Mia asked: every weekday at 9:00, have ${KERNEL.name} check that the banner still shows on the shop's home ` +
        `page in ${SHOP_PROJECT.name}, and comment if it does not. Set that up; nothing else.`,
    },
    grade(run) {
      const made = run.calls.find(c => c.name === 'create_routine')
      if (!made) return fail(`no create_routine through use_tool: ${calls(run)}`)
      const a = argsOf(made)
      if (text(a.cron).replace(/\s+/g, ' ') !== '0 9 * * 1-5') return fail(`cron is "${text(a.cron)}", not "0 9 * * 1-5"`)
      if (text(a.agentId) !== KERNEL.id) return fail(`agentId is "${text(a.agentId)}", not ${KERNEL.id}`)
      if (!/banner/i.test(text(a.instructions))) return fail(`its instructions do not say what to check: "${text(a.instructions)}"`)
      return startedNothing(run) ?? PASS
    },
  },
  {
    id: 'taskrun-fold-workflow',
    title: 'Asked to run the deploy workflow, a run finds run_workflow and calls it through use_tool',
    taskRun: {
      openLivePreview: null,
      brief: 'Mia asked: the banner is merged, so run our deploy workflow to put main on staging. Do not change any files.',
    },
    grade(run) {
      const ran = run.calls.filter(c => c.name === 'run_workflow')
      if (ran.length === 0) return fail(`no run_workflow through use_tool: ${calls(run)}`)
      const own = ran.find(c => isLivePreviewWorkflowName(text(argsOf(c).name)))
      if (own) return fail(`ran the live preview's own workflow ${text(argsOf(own).name)}: ${calls(run)}`)
      if (!ran.some(c => text(argsOf(c).name) === 'deploy-staging')) return fail(`ran ${ran.map(c => text(argsOf(c).name)).join(', ')}, not deploy-staging`)
      return startedNothing(run) ?? PASS
    },
  },
]
