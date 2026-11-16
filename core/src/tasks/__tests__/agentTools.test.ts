import { describe, expect, it } from 'vitest'
import { CONVERSATION_ONLY_TASK_TOOLS, SERVED_TASK_TOOL_DECLARATIONS, TASK_TOOL_DECLARATIONS, TASK_TOOL_NAMES } from '../agentTools.js'
import { TASK_STATES } from '../taskModel.js'
import { EXECUTION_STATES } from '../executionState.js'
import { TASK_MODEL_CONCEPTS } from '../../harness/platformToolsInstructions.js'
import { TOOL_AREAS } from '../../harness/toolAreas.js'

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

  it('serve every tool declared, with open_board a conversation\'s own', () => {
    expect(SERVED_TASK_TOOL_DECLARATIONS.map(t => t.name).sort()).toEqual([...SPEC_TOOLS].sort())
    expect([...CONVERSATION_ONLY_TASK_TOOLS]).toEqual(['open_board'])
  })

  it('never offer a way to start work but run_task and create_task asked to start', () => {
    for (const t of SERVED_TASK_TOOL_DECLARATIONS.filter(d => d.name !== 'create_task')) {
      expect(Object.keys(t.args), t.name).not.toContain('queue')
      expect(Object.keys(t.args), t.name).not.toContain('at')
      expect(t.description, t.name).not.toMatch(/\bqueue/i)
    }
    const create = TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_task')!
    expect(create.description).toMatch(/starts only if you pass queue: true/)
    expect(create.args.queue!.description).toMatch(/same reasons as run_task/)
    expect(create.args.queue!.description).toMatch(/the task is still made/)
  })

  // adr-0175, adr-0095, adr-0091: how work starts and for whom is said once, in the platform tools' instructions;
  // each tool says what else it refuses.
  it('say once, beside the tools, that work starts only when asked, who a run is for, and what is refused', () => {
    const concepts = TASK_MODEL_CONCEPTS.join('\n')
    for (const words of [
      /Work starts only when someone starts it/, /only when the person you work for asked for it/,
      /run no person started/, /Start work permission/, /through a person's connection, on theirs/,
      /on behalf of the task's person/, /cannot start another task/,
    ]) expect(concepts).toMatch(words)
    for (const t of TASK_TOOL_DECLARATIONS) expect(JSON.stringify(t), t.name).not.toMatch(/run no person started|Start work permission/)
  })

  it('say that run_task starts now, in its agent\'s line, and each refusal of its own', () => {
    const run = TASK_TOOL_DECLARATIONS.find(t => t.name === 'run_task')!
    expect(Object.keys(run.args)).toEqual(['taskId'])
    for (const words of [
      /Start a task now/, /agent's line/, /Answers at once/,
      /the task this run is working on/, /an epic/, /archived/, /no agent/, /start time still to come/, /deeper in a chain/,
      /set_task_schedule/,
    ]) expect(run.description).toMatch(words)
  })

  it('say a routine is a schedule, an agent and instructions, run on behalf of whoever last changed it, and what is refused', () => {
    const create = TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_routine')!
    const update = TASK_TOOL_DECLARATIONS.find(t => t.name === 'update_routine')!
    for (const t of [create, update]) {
      expect(t.description, t.name).toMatch(/on behalf of the person you work for/)
    }
    expect(create.description).toMatch(/in a run of a routine/)
    expect(create.description).toMatch(/does not let agents set schedules/)
    expect(update.description).toMatch(/Refused as create_routine is/)
    expect(create.description).toMatch(/owns no task/)
    expect(create.description).toMatch(/more often than every 5 minutes/)
    expect(create.description).toMatch(/skipped/)
    expect(update.description).toMatch(/switching it on or off included/)
    expect(Object.keys(update.args).sort()).toEqual(['agentId', 'cron', 'enabled', 'instructions', 'modelChoice', 'routineId', 'timezone', 'title'])
    expect(create.args.cron!.description).toMatch(/0 9 \* \* 1-5/)
  })

  it('say what each tool refuses or leaves alone, in plain words', () => {
    const description = (name: string) => TASK_TOOL_DECLARATIONS.find(t => t.name === name)!.description
    expect(description('update_task')).toMatch(/Refused/)
    expect(description('finish_sprint')).toMatch(/Refused when the project has no sprints/)
    expect(description('change_tasks')).toMatch(/which were changed, and why any were not/)
    expect(description('open_board')).toMatch(/changes nothing/)
  })

  it('name a task, an epic and a project by key or id, and say once per tool that the other ids come from list_boards', () => {
    const create = TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_task')!
    expect(create.args.projectId!.description).toMatch(/key/)
    expect(create.args.epicId!.description).toMatch(/key or id/)
    for (const name of ['create_task', 'update_task']) {
      const t = TASK_TOOL_DECLARATIONS.find(d => d.name === name)!
      expect(t.description, name).toMatch(/come from list_boards/)
      expect(JSON.stringify(t).match(/list_boards/g), name).toHaveLength(1)
    }
  })

  it('place every tool in an area, kept beside its description', () => {
    for (const t of TASK_TOOL_DECLARATIONS) expect(TOOL_AREAS, t.name).toContain(t.area)
    expect(TASK_TOOL_DECLARATIONS.find(t => t.name === 'list_boards')!.area).toBe('planning')
    expect(TASK_TOOL_DECLARATIONS.find(t => t.name === 'create_task')!.area).toBe('tasks')
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
      // create_task's explicit start is its `queue`.
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
