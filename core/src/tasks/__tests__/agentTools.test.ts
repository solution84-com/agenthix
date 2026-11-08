import { describe, expect, it } from 'vitest'
import { TASK_TOOL_DECLARATIONS, TASK_TOOL_NAMES } from '../agentTools.js'
import { TASK_STATES } from '../taskModel.js'
import { EXECUTION_STATES } from '../executionState.js'

// The tools the spec names as reworded for the new model.
const SPEC_TOOLS = [
  'create_task', 'update_task', 'change_tasks', 'list_tasks', 'get_board', 'list_boards', 'open_board', 'create_board',
  'finish_sprint', 'rename_sprint', 'run_task', 'create_routine', 'update_routine',
]

describe('the agents\' task tools, drafted for the new model', () => {
  it('declare each tool the spec names, once, and no other', () => {
    expect(TASK_TOOL_DECLARATIONS.map(t => t.name).sort()).toEqual([...SPEC_TOOLS].sort())
    expect([...TASK_TOOL_NAMES].sort()).toEqual([...SPEC_TOOLS].sort())
  })

  it('are marked draft until their wording is checked on the baseline model', () => {
    for (const t of TASK_TOOL_DECLARATIONS) expect(t.draft, t.name).toBe(true)
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
      expect(Object.keys(t.args), t.name).not.toContain('queue')
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
