/**
 * The tool search checks on a fake model: a folded tool found and called through use_tool passes as that tool, a
 * tool at Never is refused by use_tool and never found, and words that say a found tool can't be used fail.
 */
import { describe, expect, it } from 'vitest'
import type { FindToolsAnswer } from '@agenthix/core'
import type { LeadRequest, LeadStreamEvent, ModelAdapter } from '../../contract'
import { anthropicAccess } from '../../model/testSupport'
import { CHECKS, type Check } from '../checks'
import { runCheck, type RunRecord } from '../run'
import type { CheckSetup } from '../setup'
import { CURRENT_SPRINT, EPIC, MILESTONE, TASK } from '../world'

type Round = { name: string; input: unknown }[]

/** A model that makes these calls round by round, then says `words`. */
function fake(rounds: Round[], words = 'Done.'): ModelAdapter & { seen: LeadRequest[] } {
  const seen: LeadRequest[] = []
  return {
    seen,
    async *stream(request: LeadRequest): AsyncIterable<LeadStreamEvent> {
      // The messages as they were sent: the run goes on adding to the same list.
      const at = seen.push({ ...request, messages: [...request.messages] }) - 1
      const calls = rounds[at] ?? []
      if (calls.length === 0) yield { type: 'text', text: words }
      for (const [i, c] of calls.entries()) yield { type: 'tool-call', call: { id: `c${at}-${i}`, ...c } }
      yield { type: 'finish', reason: calls.length ? 'tool-calls' : 'stop', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }
    },
    complete: async () => { throw new Error('not used') },
  }
}

const check = (id: string) => CHECKS.find(c => c.id === id) as Check & { setup: CheckSetup }
const run = (id: string, model: ModelAdapter): Promise<RunRecord> => runCheck(model, anthropicAccess, check(id).setup)
const found = (model: { seen: LeadRequest[] }, round: number): FindToolsAnswer =>
  (model.seen[round]!.messages.at(-1) as { result: FindToolsAnswer }).result
const use = (name: string, input: unknown) => ({ name: 'use_tool', input: { name, input } })
const search = (query: string) => ({ name: 'find_tools', input: { query } })

describe('the tool search checks @SC-2179', () => {
  it('pass an epic\'s milestone found by search and set with plan_task through use_tool, and fail it on a plain task', async () => {
    const model = fake([[search("set a task's milestone")], [use('list_milestones', { projectId: 'WEB' })], [use('plan_task', { taskId: EPIC.key, milestoneId: MILESTONE.id })]])
    const record = await run('fold-milestone', model)
    expect(found(model, 1).tools.map(t => t.name)).toEqual(expect.arrayContaining(['plan_task', 'list_milestones']))
    expect(record.calls.map(c => c.name)).toEqual(['find_tools', 'list_milestones', 'plan_task'])
    expect(check('fold-milestone').grade(record)).toEqual({ passed: true })
    const wrong = await run('fold-milestone', fake([[use('plan_task', { taskId: EPIC.key, milestoneId: 'Pricing' })]]))
    expect(check('fold-milestone').grade(wrong)).toMatchObject({ passed: false })
    const plain = await run('fold-milestone', fake([[use('plan_task', { taskId: TASK.key, milestoneId: MILESTONE.id })]]))
    expect(check('fold-milestone').grade(plain)).toMatchObject({ passed: false })
  })

  it('pass a comment and a board list found by search, and fail without them', async () => {
    const comment = await run('fold-comment', fake([[search('comment on a task')], [use('add_comment', { taskId: TASK.key, content: 'The copy is approved.' })]]))
    expect(check('fold-comment').grade(comment)).toEqual({ passed: true })
    const boards = await run('fold-boards', fake([[use('list_boards', { projectId: 'WEB' })]]))
    expect(check('fold-boards').grade(boards)).toEqual({ passed: true })
    expect(check('fold-boards').grade(await run('fold-boards', fake([])))).toMatchObject({ passed: false })
  })

  it('never find a tool at Never, refuse it through use_tool, and pass only when the agent says it can\'t', async () => {
    const model = fake([[search('comment on a task')], [use('add_comment', { taskId: TASK.key, content: 'approved' })]])
    const tried = await run('fold-never', model)
    expect(found(model, 1).tools.map(t => t.name)).not.toContain('add_comment')
    expect((model.seen[2]!.messages.at(-1) as { result: { status: string } }).result).toMatchObject({ status: 'refused' })
    expect(check('fold-never').grade(tried)).toMatchObject({ passed: false, why: expect.stringContaining('at Never') })
    const told = await run('fold-never', fake([[search('comment on a task')]], "I'm not allowed to comment on tasks here."))
    expect(check('fold-never').grade(told)).toEqual({ passed: true })
  })

  it('pass a sprint renamed through use_tool, and fail an answer that says it can\'t', async () => {
    const renamed = await run('fold-not-impossible', fake([[use('rename_sprint', { sprintId: CURRENT_SPRINT.id, name: 'Launch sprint' })]]))
    expect(check('fold-not-impossible').grade(renamed)).toEqual({ passed: true })
    const refused = await run('fold-not-impossible', fake([], "Sorry, I can't rename sprints."))
    expect(check('fold-not-impossible').grade(refused)).toEqual({ passed: false, why: "said it can't: no tool call" })
  })

  it('send the area lines and only the must-haves', async () => {
    const model = fake([])
    await run('fold-boards', model)
    expect(JSON.stringify(model.seen[0]!.system)).toMatch(/- planning boards, sprints and milestones: [^\\]*list_boards/)
    expect(model.seen[0]!.tools.map(t => t.name)).not.toContain('list_boards')
  })
})
