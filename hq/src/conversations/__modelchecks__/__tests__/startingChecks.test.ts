/**
 * The graders of the starting and routine checks, on runs written by hand: no model is called. The checks themselves
 * run on the baseline model with `npm run test:models` (README.md beside them).
 */
import { describe, expect, it } from 'vitest'
import { STARTING_CHECKS } from '../taskRun/startingChecks'
import { answerTaskRun, startState } from '../taskRun/script'
import { taskRunFoldedTools, taskRunTools } from '../taskRun/setup'
import type { RunRecord } from '../run'

const check = (id: string) => STARTING_CHECKS.find(c => c.id === id)!
const run = (...calls: Array<[name: string, input: Record<string, unknown>]>): RunRecord => ({
  calls: calls.map(([name, input], round) => ({ round, name, input })), texts: [], answer: 'Done.',
})

describe('the starting and routine checks', () => {
  it('give a run the starting and routine tools in core\'s words, found by search', () => {
    expect(taskRunTools().map(t => t.name)).toEqual(expect.arrayContaining(['find_tools', 'use_tool', 'create_task']))
    expect(taskRunTools().map(t => t.name)).not.toContain('create_routine')
    const folded = taskRunFoldedTools().map(t => t.name)
    expect(folded).toEqual(expect.arrayContaining(['run_task', 'create_routine', 'update_routine', 'set_task_schedule', 'run_workflow']))
  })

  it('pass a weekday routine made through use_tool, and fail none made', () => {
    const c = check('taskrun-fold-routine')
    const routine = { projectId: 'SHOP', title: 'Banner check', agentId: 'agent-kernel', instructions: 'Check the banner shows', cron: '0 9 * * 1-5' }
    expect(c.grade(run(['find_tools', { query: 'every weekday' }], ['create_routine', routine])).passed).toBe(true)
    expect(c.grade(run(['create_routine (not offered)', routine])).passed).toBe(false)
    expect(c.grade(run(['create_routine', { ...routine, cron: '0 9 * * *' }])).passed).toBe(false)
  })

  it('pass the deploy workflow run, and fail the live preview\'s own or none', () => {
    const c = check('taskrun-fold-workflow')
    expect(c.grade(run(['run_workflow', { name: 'deploy-staging' }])).passed).toBe(true)
    expect(c.grade(run(['run_workflow', { name: 'start-live-preview' }])).passed).toBe(false)
    expect(c.grade(run(['list_workflows', {}])).passed).toBe(false)
  })

  it('pass the change made and the checkout follow-up left for later; fail one started, missing or with no change', () => {
    const c = check('taskrun-follow-up-not-started')
    const edit: [string, Record<string, unknown>] = ['edit_file', { file_path: '/projects/shop/clones/7a1f/public/index.html', old_string: 'a', new_string: 'b' }]
    const follow: [string, Record<string, unknown>] = ['create_task', { title: 'Banner on checkout', projectId: 'SHOP' }]
    expect(c.grade(run(edit, follow)).passed).toBe(true)
    expect(c.grade(run(['bash', { command: "sed -i 's/x/y/' public/index.html" }], follow)).passed).toBe(true)
    expect(c.grade(run(edit, ['create_task', { title: 'Banner on checkout', projectId: 'SHOP', queue: true }])).passed).toBe(false)
    expect(c.grade(run(edit, ['create_task', { title: 'Banner on checkout' }], ['run_task', { taskId: 'SHOP-9' }])).passed).toBe(false)
    expect(c.grade(run(follow)).passed).toBe(false)
    expect(c.grade(run(edit, ['create_task', { title: 'Something else' }])).passed).toBe(false)
    expect(c.grade(run(edit)).passed).toBe(false)
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
