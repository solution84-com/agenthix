/** A task row as the Tasks tool reads it: its key, its column's label, and what it waits for. */
import { describe, it, expect } from 'vitest'
import { toToolTask, type TaskRowData } from '../toolTaskRows'
import { NO_AGENT_REASON } from '../../../agents/taskExecutionReasons'

const row = (over: Partial<TaskRowData> = {}): TaskRowData => ({
  id: 't1', number: 27, title: 'Fix the checkout redirect', status: 'IN_PROGRESS', priority: 'HIGH', runState: 'RUN_NONE', runStateReason: null,
  column: 'doing', assignedAgentId: 'a1', assignedAgent: { id: 'a1', name: 'Frontend dev', handle: 'fd' },
  board: { id: 'b1', name: 'Sprint 3', columns: [{ name: 'doing', label: 'In progress' }] },
  result: null, createdAt: '2026-10-05T09:00:00Z', ...over,
})
const project = { id: 'p1', key: 'WEB', name: 'Web' }

describe('toToolTask @SC-513', () => {
  it('writes the key from the project and number, and the column by its label', () => {
    const t = toToolTask(row(), project)
    expect(t.key).toBe('WEB-27')
    expect(t.columnLabel).toBe('In progress')
    expect(t.board).toEqual({ id: 'b1', name: 'Sprint 3' })
  })

  it("reads a task in its board's Backlog as the Backlog's, with no column", () => {
    const t = toToolTask(row({ column: null }), project)
    expect(t.board).toBeNull()
    expect(t.columnLabel).toBeNull()
  })

  it("takes the task's own project over the one it is read under", () => {
    expect(toToolTask(row({ project: { id: 'p2', key: 'ME', name: 'Chat' } }), project).key).toBe('ME-27')
  })

  it('says a queued task with no agent waits for one, and so does a start time that fell due with none', () => {
    expect(toToolTask(row({ assignedAgentId: null, assignedAgent: null, runState: 'RUN_QUEUED' }), project).waitsForAgent).toBe(true)
    expect(toToolTask(row({ assignedAgentId: null, assignedAgent: null, runStateReason: NO_AGENT_REASON }), project).waitsForAgent).toBe(true)
    expect(toToolTask(row({ assignedAgentId: null, assignedAgent: null }), project).waitsForAgent).toBe(false)
    expect(toToolTask(row({ runState: 'RUN_QUEUED' }), project).waitsForAgent).toBe(false)
  })

  it('counts a running task from when its session was last worked, and a start time from when it is next due', () => {
    const t = toToolTask(row({ runState: 'RUN_ACTIVE', lastWorkedAt: new Date('2026-10-07T09:00:00Z'), scheduleNextDueAt: '2026-10-08T14:30:00Z' }), project)
    expect(t.workingSince).toBe('2026-10-07T09:00:00.000Z')
    expect(t.startsAt).toBe('2026-10-08T14:30:00.000Z')
    expect(toToolTask(row(), project).workingSince).toBeNull()
  })
})
