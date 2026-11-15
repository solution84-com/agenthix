import { describe, it, expect } from 'vitest'
import type { Board } from 'wasp/entities'
import { labelsOf, taskCommentView, taskFields, type TaskWithKind } from '../taskWire'
import { boardFields } from '../projectWire'

const at = new Date('2026-10-21T09:00:00Z')

function taskRow(over: Partial<TaskWithKind> = {}): TaskWithKind {
  return {
    id: 't1', title: 'Ship it', description: null, projectId: 'p1', number: 7,
    typeId: null, columnId: null, state: 'BACKLOG', rank: null, executionState: 'NOT_STARTED',
    sprintId: null, modelChoice: null, assignedAgentId: 'a1', priority: 'HIGH', labels: ['ops'], archived: false,
    doneAt: null, runState: 'RUN_NONE', runStateReason: null, runId: null, runCount: 0,
    applicationData: { template: 'secret' }, lastWorkedAt: null, runStartedBy: null,
    runOnBehalfOfUserId: null, queueDepth: 0, onBehalfOfUserId: 'u1', queuedByUserId: null, queuedByAgentId: null,
    queuedBySessionId: null, scheduleAt: null,
    scheduleNextDueAt: null, scheduleSetByUserId: null, scheduleSetByAgentId: null, planStart: null, planFinish: null,
    type: null, epicId: null, milestoneId: null, workspaceId: null, createdAt: at, updatedAt: at,
    ...over,
  }
}

describe('a task as the client protocol declares it @SC-1142', () => {
  it('carries the declared fields and leaves applicationData, and anything a row gains, in hq', () => {
    const row = { ...taskRow(), assignedAgent: { id: 'a1', name: 'Kernel', handle: 'kernel' }, addedLater: 1 }
    const wire = taskFields(row)
    expect(wire).not.toHaveProperty('applicationData')
    expect(wire).not.toHaveProperty('assignedAgent')
    expect(wire).not.toHaveProperty('addedLater')
    expect(wire).toMatchObject({ id: 't1', number: 7, labels: ['ops'], createdAt: at, result: null })
  })

  it("carries its latest run's result when the row was read with it", () => {
    expect(taskFields({ ...taskRow(), result: 'Two links fixed' }).result).toBe('Two links fixed')
  })

  it('reads labels stored as anything but a list of words as none, and drops what is not a word', () => {
    expect(labelsOf(['a', 2, 'b'])).toEqual(['a', 'b'])
    expect(labelsOf({ a: 1 })).toEqual([])
    expect(labelsOf(null)).toEqual([])
  })

  it('gives a comment its agent as a reference only', () => {
    const view = taskCommentView({
      id: 'c1', taskId: 't1', authorType: 'AGENT', agentId: 'a1', userId: null, runId: 'r1',
      content: 'done', parentId: 'c0', savedFromConversation: false, createdAt: at, agent: { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: 'x' } as never,
    })
    expect(view.agent).toEqual({ id: 'a1', name: 'Kernel', handle: 'kernel' })
    expect(view.parentId).toBe('c0')
  })

  it('says whether a comment was saved from the conversation', () => {
    const row = { id: 'c1', taskId: 't1', authorType: 'USER', agentId: null, userId: 'u1', runId: null, content: 'kept', parentId: null, createdAt: at, agent: null } as const
    expect(taskCommentView({ ...row, savedFromConversation: true } as never).savedFromConversation).toBe(true)
    expect(taskCommentView({ ...row, savedFromConversation: false } as never).savedFromConversation).toBe(false)
  })

  it("carries the task model's fields: its type, column and rank once it has them, its state and execution state", () => {
    const bare = taskFields(taskRow())
    expect(bare).toMatchObject({ state: 'BACKLOG', executionState: 'NOT_STARTED' })
    expect(bare).not.toHaveProperty('typeId')
    expect(bare).not.toHaveProperty('columnId')
    expect(bare).not.toHaveProperty('rank')
    expect(taskFields(taskRow({ typeId: 'ty', columnId: 'co', rank: 'i', state: 'TODO', executionState: 'WAITING' })))
      .toMatchObject({ typeId: 'ty', columnId: 'co', rank: 'i', state: 'TODO', executionState: 'WAITING' })
  })

  it("carries the task's model choice", () => {
    expect(taskFields(taskRow({ modelChoice: 'fast' })).modelChoice).toBe('fast')
    expect(taskFields(taskRow()).modelChoice).toBeNull()
  })
})

describe("a task on no board and a board as a saved view, as a client is given them @SC-1142", () => {
  it('names no board on a task', () => {
    expect(taskFields(taskRow())).not.toHaveProperty('boardId')
    expect(taskFields(taskRow())).not.toHaveProperty('column')
  })

  it('says what a saved board shows', () => {
    const board: Board = {
      id: 'b2', name: 'Bugs', projectId: 'p1', createdAt: at, updatedAt: at,
      view: 'TYPE', typeId: 't1', fieldId: null, filter: { sprint: { current: true }, other: 1 },
    }
    expect(boardFields(board)).toEqual({
      id: 'b2', name: 'Bugs', projectId: 'p1', kind: 'WORKFLOW', archivedAt: null,
      createdAt: at, updatedAt: at, view: { kind: 'TYPE', typeId: 't1', fieldId: null, filter: { sprint: { current: true } } },
    })
  })
})
