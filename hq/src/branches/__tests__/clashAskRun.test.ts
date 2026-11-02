import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  task: null as null | { runState: string; runStateReason: string | null; assignedAgent: { id: string } | null },
  updates: [] as unknown[],
  updated: 1,
}))
const calls = vi.hoisted(() => ({ ran: [] as string[], replaced: [] as string[], comments: [] as string[] }))

vi.mock('wasp/server', () => ({
  prisma: {
    task: {
      findUnique: async () => db.task,
      updateMany: async (q: unknown) => { db.updates.push(q); return { count: db.updated } },
    },
  },
}))
vi.mock('../../projects/taskStateService', () => ({ createTaskComment: async (c: { content: string }) => { calls.comments.push(c.content) } }))
vi.mock('../../projects/boardNotify', () => ({ notifyBoardsOfTasks: async () => undefined }))
vi.mock('../../agents/manifestRequests', () => ({ replaceTaskRequests: async (id: string) => { calls.replaced.push(id) } }))
vi.mock('../../agents/TaskRunner', () => ({ taskRunner: { runTask: async (id: string) => { calls.ran.push(id); return { outcome: 'started' } } } }))
vi.mock('../../conversations/coordinator/admission', () => ({ admitMessage: async () => undefined }))
vi.mock('../../conversations/store/messages', () => ({ appendMessage: async () => ({ message: {} }) }))
vi.mock('../../conversations/coordinator/events', () => ({ conversationEvents: { message: () => undefined } }))

import { askAgentAboutClash } from '../clashAsk'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'

const ask = () => askAgentAboutClash({ taskId: 't1' }, 'mia', 'the clash')

describe('a clash on a task', () => {
  beforeEach(() => {
    db.updates = []
    db.updated = 1
    calls.ran = []
    calls.replaced = []
    calls.comments = []
  })

  it('runs a task waiting for an approval again at once, replacing the request', async () => {
    db.task = { runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval', assignedAgent: { id: 'a1' } }
    expect(await ask()).toBe(true)
    expect(calls.comments).toEqual(['the clash'])
    expect(calls.replaced).toEqual(['t1'])
    expect(calls.ran).toEqual(['t1'])
  })

  it('runs a task with no run pending, without replacing anything', async () => {
    db.task = { runState: 'RUN_NONE', runStateReason: null, assignedAgent: { id: 'a1' } }
    expect(await ask()).toBe(true)
    expect(calls.replaced).toEqual([])
    expect(calls.ran).toEqual(['t1'])
  })

  it('leaves a task held because its person lost access, as Run does', async () => {
    db.task = { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON, assignedAgent: { id: 'a1' } }
    expect(await ask()).toBe(false)
    expect(db.updates).toEqual([])
    expect(calls.ran).toEqual([])
  })

  it('counts a run already queued or going as asked: it reads the comment at its next start', async () => {
    db.task = { runState: 'RUN_ACTIVE', runStateReason: null, assignedAgent: { id: 'a1' } }
    expect(await ask()).toBe(true)
    expect(calls.ran).toEqual([])
  })
})
