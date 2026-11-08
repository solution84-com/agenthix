/**
 * Finding 4: a run state's raw value never reaches the screen. One label table
 * (ui/src/tasks/runState.ts) serves every place that shows one; no run pending
 * shows nothing, and a value the table does not know — such as the DONE the
 * board once showed in its To Do column — shows nothing either.
 */
import { describe, it, expect } from 'vitest'
import { RUN_STATES, runStateLabel, runStateClasses, isRunPending, runNeedsPerson, runWaitText } from '@agenthix/ui/tasks'
import { countTasks } from '../taskCounts'

describe('the run state label table (spec §6)', () => {
  it('labels every run state but RUN_NONE in plain words', () => {
    expect(Object.fromEntries(RUN_STATES.map(s => [s, runStateLabel(s)]))).toEqual({
      RUN_NONE: null,
      RUN_QUEUED: 'Queued',
      RUN_ACTIVE: 'Running',
      RUN_BLOCKED: 'Needs you',
      RUN_FAILED: 'Run failed',
    })
  })

  it.each(['DONE', 'IDLE', 'RUNNING', 'ESCALATED', '', null, undefined])('shows nothing for %s, never the raw value', (value) => {
    expect(runStateLabel(value)).toBeNull()
    expect(runStateClasses(value)).toBe('')
  })

  it('a pending run is queued or going; a person is needed for a failed or blocked one', () => {
    expect(RUN_STATES.filter(isRunPending)).toEqual(['RUN_QUEUED', 'RUN_ACTIVE'])
    expect(RUN_STATES.filter(runNeedsPerson)).toEqual(['RUN_BLOCKED', 'RUN_FAILED'])
  })
})

describe('task counts: done by the task\'s own state, never by its run state', () => {
  it('a task in a done column counts as done whatever its run state; one not done counts by its run', () => {
    expect(countTasks([
      { state: 'DONE', runState: 'RUN_NONE' },
      { state: 'DONE', runState: 'RUN_ACTIVE' },
      { state: 'TODO', runState: 'RUN_NONE' },
      { state: 'TODO', runState: 'RUN_QUEUED' },
      { state: 'IN_PROGRESS', runState: 'RUN_ACTIVE' },
      { state: 'IN_PROGRESS', runState: 'RUN_BLOCKED' },
      { state: 'IN_PROGRESS', runState: 'RUN_FAILED' },
    ])).toEqual({ total: 7, done: 2, idle: 2, running: 1, blocked: 1, failed: 1 })
  })
})

describe('why a queued task has not started, in words (spec §6)', () => {
  it('its place in its agent\'s line', () => {
    expect(runWaitText({ kind: 'line', position: 2, agentName: 'AgentX', agentBusy: true })).toBe('2nd in line for AgentX')
    expect(runWaitText({ kind: 'line', position: 1, agentName: 'AgentX', agentBusy: true })).toBe('1st in line for AgentX')
    expect(runWaitText({ kind: 'line', position: 11, agentName: 'AgentX', agentBusy: true })).toBe('11th in line for AgentX')
    expect(runWaitText({ kind: 'line', position: 1, agentName: 'AgentX', agentBusy: false })).toBe('Starting for AgentX')
  })

    it('a run on a branch waiting for the other runs in its project to end', () => {
    expect(runWaitText({ kind: 'branch' })).toBe("Waiting for this project's other runs to finish before working on a branch")
  })

  it('a run its site holds for a free place: the site is at capacity', () => {
    expect(runWaitText({ kind: 'slot', siteName: 'office-server' })).toBe('Runs are waiting: office-server is at capacity')
    expect(runWaitText({ kind: 'slot', siteName: null })).toBe('Runs are waiting: its site is at capacity')
  })

  it('nothing when there is no note', () => {
    expect(runWaitText(null)).toBeNull()
    expect(runWaitText(undefined)).toBeNull()
  })
})
