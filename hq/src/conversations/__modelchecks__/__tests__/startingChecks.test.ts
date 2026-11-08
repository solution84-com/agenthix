/**
 * The graders of the starting and routine checks, on runs written by hand: no model is called. The checks themselves
 * run on the baseline model with `npm run test:models` (README.md beside them).
 */
import { describe, expect, it } from 'vitest'
import { STARTING_CHECKS } from '../taskRun/startingChecks'
import { answerTaskRun, startState } from '../taskRun/script'
import { taskRunTools } from '../taskRun/setup'
import type { RunRecord } from '../run'

const check = (id: string) => STARTING_CHECKS.find(c => c.id === id)!
const run = (...calls: Array<[name: string, input: Record<string, unknown>]>): RunRecord => ({
  calls: calls.map(([name, input], round) => ({ round, name, input })), texts: [], answer: 'Done.',
})

describe('the starting and routine checks', () => {
  it('give a run the starting and routine tools in core\'s words', () => {
    const tools = taskRunTools().map(t => t.name)
    expect(tools).toEqual(expect.arrayContaining(['run_task', 'create_routine', 'update_routine', 'set_task_schedule']))
  })

  it('pass a follow-up left for later, and fail one started', () => {
    const c = check('taskrun-follow-up-not-started')
    expect(c.grade(run(['create_task', { title: 'Banner on checkout', projectId: 'SHOP' }])).passed).toBe(true)
    expect(c.grade(run(['create_task', { title: 'Banner on checkout', projectId: 'SHOP', queue: true }])).passed).toBe(false)
    expect(c.grade(run(['create_task', { title: 'x' }], ['run_task', { taskId: 'SHOP-9' }])).passed).toBe(false)
    expect(c.grade(run()).passed).toBe(false)
  })

  it('pass SHOP-8 started with run_task, and fail the run\'s own task started', () => {
    const c = check('taskrun-start-asked')
    expect(c.grade(run(['run_task', { taskId: 'shop-8' }])).passed).toBe(true)
    expect(c.grade(run(['run_task', { taskId: 'SHOP-8' }], ['run_task', { taskId: 'SHOP-7' }])).passed).toBe(false)
    expect(c.grade(run(['create_task', { title: 'Free delivery email', queue: true }])).passed).toBe(false)
  })

  it('pass a weekday routine with its cron rule, agent and instructions, and fail a task made instead', () => {
    const c = check('taskrun-routine-weekdays')
    const routine = { projectId: 'SHOP', title: 'Banner check', agentId: 'agent-kernel', instructions: 'Check the banner shows', cron: '0 9 * * 1-5' }
    expect(c.grade(run(['create_routine', routine])).passed).toBe(true)
    expect(c.grade(run(['create_routine', { ...routine, cron: '0 9 * * *' }])).passed).toBe(false)
    expect(c.grade(run(['create_routine', { ...routine, agentId: 'kernel' }])).passed).toBe(false)
    expect(c.grade(run(['create_routine', routine], ['create_task', { title: 'Banner check' }])).passed).toBe(false)
  })

  it('pass a routine switched off alone, and fail one changed besides', () => {
    const c = check('taskrun-routine-off')
    expect(c.grade(run(['update_routine', { routineId: 'rt-morning', enabled: false }])).passed).toBe(true)
    expect(c.grade(run(['update_routine', { routineId: 'rt-morning', enabled: false, cron: '0 9 * * 1-5' }])).passed).toBe(false)
    expect(c.grade(run(['update_routine', { routineId: 'rt-morning', title: 'Off' }])).passed).toBe(false)
  })

  it('answer run_task on another task, and refuse it on the run\'s own', () => {
    const setup = { openLivePreview: null }
    expect(answerTaskRun('run_task', { taskId: 'SHOP-8' }, setup, startState(false))).toMatchObject({ executionState: 'WAITING' })
    expect(answerTaskRun('run_task', { taskId: 'SHOP-7' }, setup, startState(false))).toMatchObject({ error: expect.stringMatching(/this run is its run/) })
  })
})
