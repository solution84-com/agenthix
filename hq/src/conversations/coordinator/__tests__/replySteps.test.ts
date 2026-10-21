import { describe, it, expect } from 'vitest'
import { callLabel, stepLine, whyInWords } from '../replySteps'

const call = (name: string, input: unknown = {}) => ({ id: 'c', name, input })
const done = (result: unknown = {}) => ({ status: 'done' as const, operationId: 'o', result })

describe('a call in words @SC-1005', () => {
  it('names what it looked at, never the tool', async () => {
    expect(await callLabel(call('list_projects'), done())).toBe('Your projects')
    expect(await callLabel(call('get_task_details', { taskId: 't1' }), done({ title: 'Write a welcome' }))).toBe('"Write a welcome"')
    expect(await callLabel(call('get_task_details', { taskId: 'wal-2' }), { status: 'refused', reason: 'x' })).toBe('WAL-2')
    expect(await callLabel(call('list_tasks', { projectId: 'p1' }), done(), { project: async () => 'Walkthrough' })).toBe("Walkthrough's tasks")
    expect(await callLabel(call('list_tasks', { projectId: 'p1' }), null, { project: async () => 'Walkthrough' })).toBe('The tasks')
  })

  it('says what a change set out to do, and what it did once it worked', async () => {
    expect(await callLabel(call('run_task', { taskId: 'WAL-2' }), null)).toBe('Run WAL-2')
    expect(await callLabel(call('run_task', { taskId: 'WAL-2' }), { status: 'accepted', operationId: 'o' }, undefined, 'Write a one-line welcome')).toBe('Started "Write a one-line welcome"')
    expect(await callLabel(call('create_task', { title: 'Tidy' }), done())).toBe('Created "Tidy"')
    expect(await callLabel(call('start_work', { title: 'Survey' }), { status: 'waitingApproval', operationId: 'o' })).toBe('Start "Survey" — waiting for your okay')
  })

  it('falls back to plain words for a tool it has none for', async () => {
    expect(await callLabel(call('list_workforce_templates'), done())).toBe('The team templates')
    expect(await callLabel(call('some_new_tool'), done())).toBe('Some new tool')
  })

  it('gives a refusal in a few words, with no tool name in them', () => {
    expect(whyInWords('Task WAL-2 not found')).toBe('not found by that name')
    expect(whyInWords('list_tasks is outside this turn\'s project scope')).toBe('not allowed here')
    expect(whyInWords('update_task needs a person\'s approval first: ask for it with a reason')).toBe('needs your okay')
    expect(whyInWords('boom')).toBe("didn't work")
  })
})

describe("a step's line @SC-1005", () => {
  it('joins its calls, and is failed only when none worked', async () => {
    const line = await stepLine([
      { call: call('list_projects'), outcome: done() },
      { call: call('list_boards'), outcome: done() },
      { call: call('run_task', { taskId: 'WAL-2' }), outcome: { status: 'refused', reason: 'not found' } },
    ])
    expect(line).toEqual({ label: 'Your projects, The boards and Run WAL-2 — not found by that name', failed: false })
    expect((await stepLine([{ call: call('run_task', { taskId: 'WAL-2' }), outcome: { status: 'refused', reason: 'not found' } }])).failed).toBe(true)
  })
})
