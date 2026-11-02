/** What create_task and run_task tell the agent about starting work: say so in one short line, in the same step. */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CREATE_TASK_DESCRIPTION, createTaskTool } from '../createTaskTool'
import { describeRunTask } from '../runTaskTool'

const SAY_IT = /say in one short line, in the first person and in the same step as the call, what you are doing/

describe('the task tools on starting work @SC-968 @SC-969', () => {
  it('have the agent say what it is doing, never stay quiet or wait', () => {
    for (const text of [CREATE_TASK_DESCRIPTION, describeRunTask({ home: 'PERSON' }), describeRunTask({ home: 'TASK' })]) {
      expect(text).toMatch(SAY_IT)
      expect(text).toMatch(/do not wait for it/)
      expect(text).not.toMatch(/its card shows/i)
    }
  })

  it('have a task set for a time said with when it starts', () => {
    expect(CREATE_TASK_DESCRIPTION).toMatch(/For a time, setting it is the whole of it.*Say when it starts/)
  })

  it('say a task set for a time is done once set: its run does not come back here', () => {
    expect(CREATE_TASK_DESCRIPTION).toMatch(/For now, the work then goes on in the background and its first run's result comes back/)
    expect(CREATE_TASK_DESCRIPTION).toMatch(/For a time, setting it is the whole of it: its runs are the project's own/)
  })
})

describe("create_task's workspace", () => {
  it('is asked for on every call, a code workspace or null, and a call without it reads as null', () => {
    const schema = z.toJSONSchema(createTaskTool.input, { io: 'input' }) as { required: string[]; properties: Record<string, { type: unknown }> }
    expect(schema.required).toContain('workspaceId')
    expect(schema.properties.workspaceId!.type).toEqual(['string', 'null'])
    const task = { title: 'Login page', projectId: 'WEB', orgId: 'org', when: 'now' }
    expect((createTaskTool.input.parse(task) as { workspaceId: unknown }).workspaceId).toBeNull()
    expect((createTaskTool.input.parse({ ...task, workspaceId: 'w1' }) as { workspaceId: unknown }).workspaceId).toBe('w1')
  })
})
