/** A visitor's own tasks, made as they enter (usability finding 9), with the project service replaced. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ made: [] as Record<string, unknown>[], fail: false }))
vi.mock('../../../projects/personalProject', () => ({
  ensurePersonalProject: async (userId: string) => ({ id: `space-of-${userId}`, key: 'MY1', name: 'My tasks' }),
}))
vi.mock('../../../projects/taskService', () => ({
  createTask: async (params: Record<string, unknown>) => {
    if (h.fail) throw new Error('database down')
    h.made.push(params)
    return { id: `t${h.made.length}` }
  },
}))
vi.mock('../../../server/utils/logger', () => ({ Logger: class { error() {} } }))

import { giveVisitorTasks, VISITOR_TASKS } from '../visitorTasks'

beforeEach(() => { h.made = []; h.fail = false })

describe("a visitor's own tasks", () => {
  it('are made in their own space, for them, planned, with no agent, so nothing starts by itself @SC-1952', async () => {
    expect(await giveVisitorTasks('v1')).toBe(2)
    expect(h.made.map(t => t.title)).toEqual(VISITOR_TASKS.map(t => t.title))
    for (const t of h.made) {
      expect(t).toMatchObject({ projectId: 'space-of-v1', state: 'TODO', origin: { onBehalfOfUserId: 'v1', queuer: { kind: 'person', userId: 'v1' } } })
      expect(t.assignedAgentId).toBeUndefined()
    }
  })

  it('never stop a visitor getting in: a failure is logged and leaves them none @SC-1952', async () => {
    h.fail = true
    expect(await giveVisitorTasks('v2')).toBe(0)
  })
})
