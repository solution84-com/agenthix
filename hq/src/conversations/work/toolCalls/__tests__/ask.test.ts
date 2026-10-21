/**
 * What the approval card says of a call at Ask, and the reason the lead must give with it (conversation layer
 * spec, Approval; on-screen spec, Approvals say why). Pure.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { describeCall, withReason, REASON_MAX_CHARS } from '../ask'

describe('what the call would do @SC-959', () => {
  it('names the tool and the arguments a person reads, never ids', () => {
    expect(describeCall('update_task', { taskId: 't1', title: 'Fix the resize step', priority: 2, done: false }))
      .toBe('Update task (title: "Fix the resize step", priority: 2, done: false)')
  })

  it('is the tool alone when nothing else is worth reading', () => {
    expect(describeCall('delete_task', { taskId: 't1', labels: ['a'] })).toBe('Delete task')
  })

  it('is clipped to one card line', () => {
    expect(describeCall('add_comment', { body: 'x'.repeat(1_000) }).length).toBeLessThanOrEqual(300)
  })
})

describe('the reason @SC-959', () => {
  const input = withReason(z.object({ taskId: z.string() }))

  it('is required, and not blank', () => {
    expect(input.safeParse({ taskId: 't1' }).success).toBe(false)
    expect(input.safeParse({ taskId: 't1', reason: '   ' }).success).toBe(false)
    expect(input.safeParse({ taskId: 't1', reason: 'to tidy the board' }).success).toBe(true)
  })

  it('is one line, not an essay', () => {
    expect(input.safeParse({ taskId: 't1', reason: 'x'.repeat(REASON_MAX_CHARS + 1) }).success).toBe(false)
  })

  it('joins an input that is not a plain object too', () => {
    const joined = withReason(z.object({ a: z.string() }).refine(v => v.a !== 'no'))
    expect(joined.safeParse({ a: 'yes', reason: 'because' }).success).toBe(true)
    expect(joined.safeParse({ a: 'yes' }).success).toBe(false)
  })
})
