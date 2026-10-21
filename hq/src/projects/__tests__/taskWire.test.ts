import { describe, it, expect } from 'vitest'
import type { Board, Task } from 'wasp/entities'
import { labelsOf, taskCommentView, taskFields } from '../taskWire'
import { wireColumns } from '../boardColumns'
import { boardFields } from '../projectWire'

const at = new Date('2026-10-21T09:00:00Z')

function taskRow(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Ship it', description: null, projectId: 'p1', number: 7, boardId: 'b1', column: 'todo',
    sprintId: null, status: 'TODO', assignedAgentId: 'a1', priority: 'HIGH', labels: ['ops'], archived: false,
    doneAt: null, runState: 'RUN_NONE', runStateReason: null, runId: null, result: null,
    applicationData: { template: 'secret' }, deferCount: 0, lastWorkedAt: null, runStartedBy: null,
    runOnBehalfOfUserId: null, queueDepth: 0, onBehalfOfUserId: 'u1', queuedByUserId: null, queuedByAgentId: null,
    queuedBySessionId: null, queuedByConnectionId: null, createdByConnectionId: null, scheduleAt: null,
    scheduleNextDueAt: null, scheduleSetByUserId: null, scheduleSetByAgentId: null, scheduleSetBySessionId: null,
    scheduleSetByConnectionId: null, routineId: null, roundAt: null, planStart: null, planFinish: null,
    isEpic: false, epicId: null, milestoneId: null, createdAt: at, updatedAt: at,
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
    expect(wire).toMatchObject({ id: 't1', number: 7, labels: ['ops'], createdAt: at })
  })

  it('reads labels stored as anything but a list of words as none, and drops what is not a word', () => {
    expect(labelsOf(['a', 2, 'b'])).toEqual(['a', 'b'])
    expect(labelsOf({ a: 1 })).toEqual([])
    expect(labelsOf(null)).toEqual([])
  })

  it('gives a comment its agent as a reference only', () => {
    const view = taskCommentView({
      id: 'c1', taskId: 't1', authorType: 'AGENT', agentId: 'a1', userId: null, connectionId: null, runId: 'r1',
      content: 'done', createdAt: at, agent: { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: 'x' } as never,
    })
    expect(view.agent).toEqual({ id: 'a1', name: 'Kernel', handle: 'kernel' })
  })
})

describe("a board's columns as a client is given them @SC-1142", () => {
  it('keeps each declared field, and an optional one only where it was stored', () => {
    const stored = [{ name: 'todo', label: 'To do', status: 'TODO', color: '#6B7280', order: 0, autoQueue: true, legacy: 'x' }]
    expect(wireColumns(stored)).toEqual([{ name: 'todo', label: 'To do', status: 'TODO', color: '#6B7280', order: 0, autoQueue: true }])
  })

  it("keeps the board's stored order and reads columns that are not a list as none", () => {
    const board: Board = {
      id: 'b1', name: 'Work', projectId: 'p1', kind: 'WORKFLOW', templateId: null, archivedAt: null,
      createdAt: at, updatedAt: at, columns: 'not json',
    }
    expect(boardFields(board).columns).toEqual([])
    const two = [{ name: 'b', label: 'B', status: 'DONE', color: '#000', order: 1 }, { name: 'a', label: 'A', status: 'TODO', color: '#000', order: 0 }]
    expect(boardFields({ ...board, columns: two }).columns.map(c => c.name)).toEqual(['b', 'a'])
  })
})
