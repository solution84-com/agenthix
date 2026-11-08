import { describe, expect, it } from 'vitest'
import { CONVERSATION_ONLY_TASK_TOOLS, SERVED_TASK_TOOL_DECLARATIONS, TASK_TOOL_DECLARATIONS, TASK_TOOL_NAMES } from '../agentTools.js'
import { TASK_STATES } from '../taskModel.js'
import { EXECUTION_STATES } from '../executionState.js'

// The tools the spec names as reworded for the new model.
const SPEC_TOOLS = [
  'create_task', 'update_task', 'change_tasks', 'list_tasks', 'get_board', 'list_boards', 'open_board', 'create_board',
  'finish_sprint', 'rename_sprint', 'run_task', 'create_routine', 'update_routine',
]

describe('the agents\' task tools, in the new model', () => {
  it('declare each tool the spec names, once, and no other', () => {
    expect(TASK_TOOL_DECLARATIONS.map(t => t.name).sort()).toEqual([...SPEC_TOOLS].sort())
    expect([...TASK_TOOL_NAMES].sort()).toEqual([...SPEC_TOOLS].sort())
  })

  it('serve the task, board and sprint tools, and keep starting work and routines as drafts until their phases', () => {
    expect(SERVED_TASK_TOOL_DECLARATIONS.map(t => t.name).sort()).toEqual([
      'change_tasks', 'create_board', 'create_task', 'finish_sprint', 'get_board', 'list_boards', 'list_tasks', 'open_board',
      'rename_sprint', 'update_task',
    ])
    for (const name of ['run_task', 'create_routine', 'update_routine']) {
      expect(TASK_TOOL_DECLARATIONS.find(t => t.name === name)!.draft, name).toBe(true)
    }
    expect([...CONVERSATION_ONLY_TASK_TOOLS]).toEqual(['open_board'])
  })

  it('never offer a way to start work but run_task and create_task asked to start', () => {
    for (const t of SERVED_TASK_TOOL_DECLARATIONS.filter(d => d.name !== 'create_task')) {
      expect(Object.keys(t.args), t.name).not.toContain('queue')
      expect(Object.keys(t.args), t.name).not.toContain('at')
      expect(t.description, t.name).not.toMatch(/\bqueue/i)
    }
    const create = TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_task')!
    expect(create.description).toMatch(/never starts it.*unless you pass queue: true/)
    expect(create.args.queue!.description).toMatch(/only in a run they started/)
  })

  it('say what each tool refuses or leaves alone, in plain words', () => {
    const description = (name: string) => TASK_TOOL_DECLARATIONS.find(t => t.name === name)!.description
    expect(description('update_task')).toMatch(/Refused/)
    expect(description('finish_sprint')).toMatch(/Refused when the project has no sprints/)
    expect(description('change_tasks')).toMatch(/which were changed, and why any were not/)
    expect(description('open_board')).toMatch(/changes nothing/)
  })

  it('name a task, an epic and a project by key or id, and every other thing by its id from list_boards', () => {
    const create = TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_task')!
    expect(create.args.projectId!.description).toMatch(/key/)
    expect(create.args.epicId!.description).toMatch(/key or id/)
    for (const arg of ['typeId', 'columnId', 'sprintId', 'fieldValues']) expect(create.args[arg]!.description, arg).toMatch(/list_boards/)
  })

  it('cap the lists an agent may send', () => {
    const change = TASK_TOOL_DECLARATIONS.find(t => t.name === 'change_tasks')!
    expect(change.args.taskIds!.maxItems).toBe(100)
  })

  it('never take who asks as an argument: the person comes from the run', () => {
    const who = /^(runId|userId|onBehalfOfUserId|createdBy|orgId|agentIdOfCaller)$/
    for (const t of TASK_TOOL_DECLARATIONS) for (const arg of Object.keys(t.args)) expect(who.test(arg), `${t.name}.${arg}`).toBe(false)
  })

  it('describe the tool and every argument in words', () => {
    for (const t of TASK_TOOL_DECLARATIONS) {
      expect(t.description.length, t.name).toBeGreaterThan(20)
      for (const [name, a] of Object.entries(t.args)) expect(a.description.trim(), `${t.name}.${name}`).not.toBe('')
    }
  })

  it('speak the new model: types, columns and states, never a board\'s column or the old run states', () => {
    const update = TASK_TOOL_DECLARATIONS.find(t => t.name === 'update_task')!
    expect(Object.keys(update.args)).toEqual(expect.arrayContaining(['typeId', 'columnId', 'state', 'sprintId', 'afterTaskId', 'fieldValues']))
    for (const t of TASK_TOOL_DECLARATIONS) {
      expect(Object.keys(t.args), t.name).not.toContain('column')
      expect(Object.keys(t.args), t.name).not.toContain('isEpic')
      // create_task's explicit start (`queue`) stays until how work starts is reworded (plan 6.4).
      if (t.name !== 'create_task') expect(Object.keys(t.args), t.name).not.toContain('queue')
      expect(JSON.stringify(t), t.name).not.toMatch(/RUN_(QUEUED|THROTTLED|BLOCKED)|pulse|throttle/i)
    }
    const list = TASK_TOOL_DECLARATIONS.find(t => t.name === 'list_tasks')!
    expect(list.args.state!.values).toEqual(TASK_STATES)
    expect(list.args.executionState!.values).toEqual(EXECUTION_STATES)
  })

  it('make a routine a schedule, an agent and instructions, with no task template', () => {
    const create = TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_routine')!
    expect(Object.keys(create.args).sort()).toEqual(['agentId', 'cron', 'instructions', 'modelChoice', 'projectId', 'timezone', 'title'])
  })
})
