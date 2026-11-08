/**
 * The task, board and sprint tools every transport validates against are built from core's declarations (adr-0174,
 * adr-0176): one set of words for the agent and the validator, hq's own limits, nothing a person's connection cannot
 * be placed for, starting work only under Start work, and no tool that names the old board's columns.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { SERVED_TASK_TOOL_DECLARATIONS, TASK_TOOL_DECLARATIONS } from '@agenthix/core'
import { CONTROL_PLANE_TOOLS } from '../toolSchemas'
import { TASK_TOOLS, TASK_TOOL_NAME_SET } from '../taskToolSchemas'
import { TOOL_GROUPS } from '../connectionGroups'
import { isTurnTool } from '../turnCaller'
import { SPRINT_NAME_MAX_LENGTH } from '../../../projects/sprintSeries'
import { BOARD_NAME_MAX_LENGTH } from '../../../projects/boardSaveService'

const schemaOf = (name: string) => z.object(CONTROL_PLANE_TOOLS.find(t => t.name === name)!.schema)

describe('the task tools on hq', () => {
  it('are every served declaration but open_board, which a conversation has to itself', () => {
    expect([...TASK_TOOL_NAME_SET].sort()).toEqual(SERVED_TASK_TOOL_DECLARATIONS.map(d => d.name).filter(n => n !== 'open_board').sort())
    expect(CONTROL_PLANE_TOOLS.map(t => t.name)).not.toContain('open_board')
    for (const t of TASK_TOOLS) expect(CONTROL_PLANE_TOOLS.filter(c => c.name === t.name), t.name).toHaveLength(1)
  })

  it("carry core's descriptions, word for word", () => {
    for (const t of TASK_TOOLS) expect(t.description).toBe(TASK_TOOL_DECLARATIONS.find(d => d.name === t.name)!.description)
  })

  it('are each placed in a connection group; those that start work or make routines are Start work, and no turn calls them', () => {
    expect(TOOL_GROUPS.change_tasks).toBe('change_tasks')
    const starting = ['run_task', 'create_routine', 'update_routine']
    for (const name of TASK_TOOL_NAME_SET) {
      expect(TOOL_GROUPS[name], name).toBeDefined()
      expect(TOOL_GROUPS[name] === 'start_work', name).toBe(starting.includes(name))
      // A conversation starts work as an operation of its own (conversations/work/tasks), never as a quick call.
      expect(isTurnTool(name), name).toBe(!starting.includes(name))
    }
  })

  it('take run_task by its task alone, and switch a routine on or off with update_routine', () => {
    expect(Object.keys(CONTROL_PLANE_TOOLS.find(t => t.name === 'run_task')!.schema)).toEqual(['taskId'])
    const update = schemaOf('update_routine')
    expect(update.parse({ routineId: 'r1', enabled: false })).toEqual({ routineId: 'r1', enabled: false })
    expect(update.safeParse({ routineId: 'r1', modelChoice: null }).success).toBe(true)
    expect(schemaOf('create_routine').safeParse({ projectId: 'WEB', title: 'x'.repeat(121), agentId: 'a', instructions: 'i', cron: '0 9 * * 1-5' }).success).toBe(false)
  })

  it('hold the arguments to their shapes: closed values, null to clear, and list limits', () => {
    const update = schemaOf('update_task')
    expect(update.safeParse({ taskId: 'WEB-1', state: 'DONE' }).success).toBe(true)
    expect(update.safeParse({ taskId: 'WEB-1', state: 'done' }).success).toBe(false)
    expect(update.safeParse({ taskId: 'WEB-1', sprintId: null, epicId: null, assignedAgentId: null }).success).toBe(true)
    expect(update.safeParse({ taskId: 'WEB-1', columnId: null }).success).toBe(false)
    expect(update.safeParse({ taskId: 'WEB-1', fieldValues: { f1: 'o1', f2: '' } }).success).toBe(true)
    const change = schemaOf('change_tasks')
    expect(change.safeParse({ taskIds: Array.from({ length: 100 }, (_, i) => `t${i}`), state: 'TODO' }).success).toBe(true)
    expect(change.safeParse({ taskIds: Array.from({ length: 101 }, (_, i) => `t${i}`), state: 'TODO' }).success).toBe(false)
    expect(schemaOf('list_tasks').safeParse({ projectId: 'WEB', limit: 0 }).success).toBe(false)
    expect(schemaOf('create_task').safeParse({ title: 'T' }).success).toBe(false)
  })

  it("strip what the old tools took, so a call that names a board or a board's column moves nothing by it", () => {
    const parsed = schemaOf('create_task').parse({ title: 'T', projectId: 'WEB', boardId: 'b1', column: 'todo', isEpic: true }) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['projectId', 'title'])
  })

  it("keep hq's own limits on a sprint's and a saved board's name", () => {
    expect(schemaOf('rename_sprint').safeParse({ sprintId: 's', name: 'x'.repeat(SPRINT_NAME_MAX_LENGTH) }).success).toBe(true)
    expect(schemaOf('rename_sprint').safeParse({ sprintId: 's', name: 'x'.repeat(SPRINT_NAME_MAX_LENGTH + 1) }).success).toBe(false)
    const board = { projectId: 'WEB', kind: 'STATE' }
    expect(schemaOf('create_board').safeParse({ ...board, name: 'x'.repeat(BOARD_NAME_MAX_LENGTH) }).success).toBe(true)
    expect(schemaOf('create_board').safeParse({ ...board, name: 'x'.repeat(BOARD_NAME_MAX_LENGTH + 1) }).success).toBe(false)
  })
})
