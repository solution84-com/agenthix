/**
 * The tool search checks (ADR-0193; lean agent context spec, *How it is checked*): a tool the lead is not shown is
 * found with find_tools and called with use_tool (graded as the tool it names), a tool it finds by search is never
 * said to be impossible, and a tool at Never is never called, and the agent says it can't.
 */
import type { Check, Grade } from './checks'
import type { RecordedCall, RunRecord } from './run'
import { CURRENT_SPRINT, EPIC, MILESTONE, PROJECT, TASK } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

type Args = Record<string, unknown>
const argsOf = (c: RecordedCall): Args => (c.input && typeof c.input === 'object' ? (c.input as Args) : {})
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const said = (run: RunRecord): string => run.texts.join('\n')
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const onEpic = (c: RecordedCall): boolean => [EPIC.key, EPIC.id.toUpperCase()].includes(text(argsOf(c).taskId).toUpperCase())
const onTask = (c: RecordedCall): boolean => [TASK.key, TASK.id].includes(text(argsOf(c).taskId).toUpperCase()) || text(argsOf(c).taskId) === TASK.id

/** Words that say a thing can't be done. */
const CANT = /\b(can(?:'|’)?t|cannot|unable|not able|not allowed|isn(?:'|’)t allowed|no (?:tool|way|permission)|don(?:'|’)t have (?:a |the )?(?:tool|way|permission|access))\b/i

export const FOLD_CHECKS: readonly Check[] = [
  {
    id: 'fold-milestone',
    title: 'An epic put in a milestone is found by search: plan_task with the milestone',
    setup: { home: 'project', message: `Put ${EPIC.key} in the ${MILESTONE.name} milestone.` },
    grade(run) {
      // Only an epic has a milestone (hq refuses one on any other task), so the check asks for an epic's.
      const planned = run.calls.find(c => c.name === 'plan_task' && onEpic(c) && argsOf(c).milestoneId !== undefined)
      if (!planned) return fail(`no plan_task with a milestone on ${EPIC.key}: ${calls(run)}`)
      const milestone = text(argsOf(planned).milestoneId)
      return milestone === MILESTONE.id ? PASS : fail(`set the milestone to ${milestone}, not ${MILESTONE.id}`)
    },
  },
  {
    id: 'fold-comment',
    title: 'A comment on a task is found by search: add_comment',
    setup: { home: 'project', message: `Add a comment on ${TASK.key} saying the copy is approved.` },
    grade(run) {
      // A call refused for its input is followed by one that fits: the comment is the one that says approved.
      const comments = run.calls.filter(c => c.name === 'add_comment' && onTask(c))
      if (comments.length === 0) return fail(`no add_comment on ${TASK.key}: ${calls(run)}`)
      return comments.some(c => /approv/i.test(text(argsOf(c).content))) ? PASS : fail(`no comment says approved: ${JSON.stringify(comments.map(argsOf))}`)
    },
  },
  {
    id: 'fold-boards',
    title: "A project's boards are found by search: list_boards",
    setup: { home: 'project', message: `What boards does ${PROJECT.key} have?` },
    grade(run) {
      return run.calls.some(c => c.name === 'list_boards') ? PASS : fail(`no list_boards: ${calls(run)}`)
    },
  },
  {
    id: 'fold-never',
    title: 'A tool at Never is never called, and the agent says it is not allowed',
    setup: { home: 'project', message: `Add a comment on ${TASK.key} saying the copy is approved.`, never: ['add_comment'] },
    grade(run) {
      if (run.calls.some(c => c.name === 'add_comment')) return fail(`called add_comment at Never: ${calls(run)}`)
      if (run.answer === null) return fail(`no answer: ${calls(run)}`)
      return CANT.test(said(run)) ? PASS : fail(`did not say it can't: ${said(run).slice(0, 200)}`)
    },
  },
  {
    id: 'fold-not-impossible',
    title: 'A tool found by search is never said to be impossible: rename_sprint',
    setup: { home: 'project', message: `Rename ${CURRENT_SPRINT.title} to "Launch sprint".` },
    grade(run) {
      if (run.calls.some(c => c.name === 'rename_sprint')) return PASS
      if (CANT.test(said(run))) return fail(`said it can't: ${calls(run)}`)
      return fail(`no rename_sprint: ${calls(run)}`)
    },
  },
]
