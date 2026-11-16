/**
 * What a failed run did, in the report: each call's input cut short, each find_tools query with the names it found,
 * and the final words, written under the failed run's line and never under a passed one.
 */
import { describe, expect, it } from 'vitest'
import type { LeadRequest, LeadStreamEvent, ModelAdapter } from '../../contract'
import { anthropicAccess } from '../../model/testSupport'
import { CHECKS, type Check } from '../checks'
import { report } from '../report'
import { runCheck, type RunRecord } from '../run'
import type { CheckSetup } from '../setup'
import { traceOf } from '../trace'
import { TASK } from '../world'

function fake(rounds: { name: string; input: unknown }[][], words: string): ModelAdapter {
  let at = 0
  return {
    async *stream(_request: LeadRequest): AsyncIterable<LeadStreamEvent> {
      const calls = rounds[at++] ?? []
      if (calls.length === 0) yield { type: 'text', text: words }
      for (const [i, c] of calls.entries()) yield { type: 'tool-call', call: { id: `c${at}-${i}`, ...c } }
      yield { type: 'finish', reason: calls.length ? 'tool-calls' : 'stop', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }
    },
    complete: async () => { throw new Error('not used') },
  }
}

const check = (id: string) => CHECKS.find(c => c.id === id) as Check & { setup: CheckSetup }

describe('the trace of a failed run', () => {
  it('records the names find_tools answered, each call\'s input and the final words', async () => {
    const model = fake([[{ name: 'find_tools', input: { query: 'comment on a task' } }], [{ name: 'get_task_details', input: { taskId: TASK.key } }]], 'I looked at it.')
    const record = await runCheck(model, anthropicAccess, check('fold-comment').setup)
    expect(record.calls[0]!.found).toContain('add_comment')
    const trace = traceOf(record)
    expect(trace[0]).toMatch(/^round 1 · find_tools "comment on a task" → .*add_comment/)
    expect(trace[1]).toBe(`round 2 · get_task_details {"taskId":"${TASK.key}"}`)
    expect(trace.at(-1)).toBe('answer: "I looked at it."')
  })

  it('cuts a long input short and says when the rounds ran out', () => {
    const run: RunRecord = { calls: [{ round: 0, name: 'bash', input: { command: 'x'.repeat(500) } }], texts: ['Looking.'], answer: null }
    const [call, end] = traceOf(run)
    expect(call!.length).toBeLessThan(300)
    expect(call).toMatch(/…$/)
    expect(end).toBe('no answer; the last words: "Looking."')
  })

  it('is written under a failed run only', () => {
    const passed = { model: 'm', check: 'c', run: 1, grade: { passed: true as const }, trace: ['not shown'] }
    const failed = { model: 'm', check: 'c', run: 2, grade: { passed: false as const, why: 'no call' }, trace: ['round 1 · bash {}'] }
    const text = report([passed, failed], ['c'], ['m'], new Date(0))
    expect(text).toContain('m · c · run 2: failed: no call\n    round 1 · bash {}')
    expect(text).not.toContain('not shown')
  })
})
