/** What create_task and run_task tell the agent, and who does a task created with no agent named. */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CREATE_TASK_DESCRIPTION, agentFor, createTaskTool } from '../createTaskTool'
import { describeRunTask } from '../runTaskTool'
import { readWhen } from '../when'

describe('the task tools on starting work @SC-968 @SC-969', () => {
  it('say the result comes back, so the agent does not wait; what to say on starting is the base rule', () => {
    for (const text of [CREATE_TASK_DESCRIPTION, describeRunTask({ home: 'PERSON' }), describeRunTask({ home: 'TASK' })]) {
      expect(text).toMatch(/do not wait for it/)
      expect(text).not.toMatch(/say in one short line/)
      expect(text).not.toMatch(/its card shows/i)
    }
  })

  it('have a task set for a time said with when it starts, and nothing come back from it', () => {
    expect(CREATE_TASK_DESCRIPTION).toMatch(/A time starts it then, and nothing comes back here: say when it starts/)
  })
})

describe("create_task's fields in a conversation", () => {
  const properties = () => Object.keys((z.toJSONSchema(createTaskTool.input, { io: 'input' }) as { properties: object }).properties).sort()

  it('are the lean set: the planning fields are plan_task\'s', () => {
    expect(properties()).toEqual(['assignedAgentId', 'description', 'model', 'projectId', 'then', 'timezone', 'title', 'when', 'workspaceId'])
  })
})

describe("create_task's workspace @SC-1675", () => {
  it('is asked for on every call, a code workspace or null, and a call without it reads as null', () => {
    const schema = z.toJSONSchema(createTaskTool.input, { io: 'input' }) as { required: string[]; properties: Record<string, { type: unknown }> }
    expect(schema.required).toContain('workspaceId')
    expect(schema.properties.workspaceId!.type).toEqual(['string', 'null'])
    const task = { title: 'Login page', projectId: 'WEB', when: 'now' }
    expect((createTaskTool.input.parse(task) as { workspaceId: unknown }).workspaceId).toBeNull()
    expect((createTaskTool.input.parse({ ...task, workspaceId: 'w1' }) as { workspaceId: unknown }).workspaceId).toBe('w1')
  })
})

describe('a task created with no agent named (spec decision 7)', () => {
  it('for now or a time, is done by the agent the person is talking with', () => {
    expect(agentFor(readWhen('now'), undefined, 'kernel')).toBe('kernel')
    expect(agentFor(readWhen('2099-01-05T09:00'), undefined, 'kernel')).toBe('kernel')
  })

  it('names another agent as today', () => {
    expect(agentFor(readWhen('now'), 'qa', 'kernel')).toBe('qa')
  })

  it('for later, has no agent until someone names one', () => {
    expect(agentFor(readWhen('later'), undefined, 'kernel')).toBeUndefined()
  })
})
