/**
 * The task, board and sprint tools an agent is given are core's declarations (spec *What changes*, Agents' tools):
 * the words the agent reads are the words hq validates against, and a run is never given open_board, which shows a
 * board to a person in a conversation.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { SERVED_TASK_TOOL_DECLARATIONS } from '@agenthix/core'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'
import { FORWARDED_TASK_TOOLS, TASK_TOOL_NAME_SET } from '../forwardedTaskSchemas'

describe('the forwarded task tools', () => {
  it('are every served declaration but open_board, each forwarded once, in its words', () => {
    expect([...TASK_TOOL_NAME_SET].sort()).toEqual(SERVED_TASK_TOOL_DECLARATIONS.map(d => d.name).filter(n => n !== 'open_board').sort())
    for (const t of FORWARDED_TASK_TOOLS) {
      expect(FORWARDED_TOOLS.filter(f => f.name === t.name), t.name).toHaveLength(1)
      expect(t.description).toBe(SERVED_TASK_TOOL_DECLARATIONS.find(d => d.name === t.name)!.description)
      expect(Object.keys(t.schema).sort()).toEqual(Object.keys(SERVED_TASK_TOOL_DECLARATIONS.find(d => d.name === t.name)!.args).sort())
    }
    expect(FORWARDED_TOOLS.map(t => t.name)).not.toContain('open_board')
  })

  it('show the agent the new model: no board column, and no queue but create_task\'s explicit start', () => {
    const update = FORWARDED_TASK_TOOLS.find(t => t.name === 'update_task')!
    expect(Object.keys(update.schema)).toEqual(expect.arrayContaining(['typeId', 'columnId', 'state', 'sprintId', 'fieldValues']))
    for (const t of FORWARDED_TASK_TOOLS) for (const old of ['column', 'boardId', 'queue', 'isEpic']) {
      if (t.name === 'get_board' && old === 'boardId') continue
      // create_task's explicit start stays until how work starts is reworded (plan 6.4).
      if (t.name === 'create_task' && old === 'queue') continue
      expect(Object.keys(t.schema), `${t.name}.${old}`).not.toContain(old)
    }
  })

  it('do not require an organisation for create_task, as hq does not', () => {
    const tool = FORWARDED_TOOLS.find(t => t.name === 'create_task')!
    expect(z.object(tool.schema).safeParse({ title: 'T', projectId: 'p1' }).success).toBe(true)
  })
})
