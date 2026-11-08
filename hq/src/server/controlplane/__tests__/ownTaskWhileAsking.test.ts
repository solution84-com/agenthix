/** A run waiting for an approval may not change its own task's state, column or type: hq's half of the rule. */
import { describe, expect, it } from 'vitest'
import { OWN_TASK_HELD_WHILE_ASKING, refuseOwnTaskMoveWhileAsking } from '../ownTaskWhileAsking'
import type { CallerContext } from '../types'

const run = (waitingForApproval?: boolean): CallerContext =>
  ({ kind: 'run', claims: { taskId: 'task-1' } as never, ...(waitingForApproval ? { waitingForApproval } : {}) })

describe('refuseOwnTaskMoveWhileAsking', () => {
  it('refuses a waiting run changing its own task, among others or alone, with words that end "Nothing was changed."', () => {
    for (const ids of [['task-1'], ['task-2', 'task-1']]) {
      expect(() => refuseOwnTaskMoveWhileAsking(run(true), ids, true)).toThrow(OWN_TASK_HELD_WHILE_ASKING)
    }
    expect(OWN_TASK_HELD_WHILE_ASKING).toMatch(/Nothing was changed\.$/)
  })

  it('lets it be: another task, a change that is not of its place, a run that has asked for nothing, or a person', () => {
    expect(() => refuseOwnTaskMoveWhileAsking(run(true), ['task-2'], true)).not.toThrow()
    expect(() => refuseOwnTaskMoveWhileAsking(run(true), ['task-1'], false)).not.toThrow()
    expect(() => refuseOwnTaskMoveWhileAsking(run(), ['task-1'], true)).not.toThrow()
    const person = { kind: 'connection', connection: { userId: 'u' } } as never as CallerContext
    expect(() => refuseOwnTaskMoveWhileAsking(person, ['task-1'], true)).not.toThrow()
  })
})
