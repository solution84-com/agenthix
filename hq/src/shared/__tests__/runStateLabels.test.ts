/**
 * Finding 4: a run state's raw value never reaches the screen. One label table
 * (ui/src/tasks/runState.ts) serves every place that shows one; no run pending
 * shows nothing, and a value the table does not know — such as the DONE the
 * board once showed in its To Do column — shows nothing either.
 */
import { describe, it, expect } from 'vitest'
import { RUN_STATES, runStateLabel, runStateClasses, isRunPending, runNeedsPerson, runWaitText } from '@agenthix/ui/tasks'
import { roundLineText } from '@agenthix/ui/board'
import { countTasks } from '../taskCounts'

describe('the run state label table (spec §6)', () => {
  it('labels every run state but RUN_NONE in plain words', () => {
    expect(Object.fromEntries(RUN_STATES.map(s => [s, runStateLabel(s)]))).toEqual({
      RUN_NONE: null,
      RUN_QUEUED: 'Queued',
      RUN_THROTTLED: 'Throttled',
      RUN_ACTIVE: 'Running',
      RUN_BLOCKED: 'Needs you',
      RUN_FAILED: 'Run failed',
    })
  })

  it.each(['DONE', 'IDLE', 'RUNNING', 'ESCALATED', '', null, undefined])('shows nothing for %s, never the raw value', (value) => {
    expect(runStateLabel(value)).toBeNull()
    expect(runStateClasses(value)).toBe('')
  })

  it('a pending run is queued, throttled or going; a person is needed for a failed or blocked one', () => {
    expect(RUN_STATES.filter(isRunPending)).toEqual(['RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE'])
    expect(RUN_STATES.filter(runNeedsPerson)).toEqual(['RUN_BLOCKED', 'RUN_FAILED'])
  })
})

describe('task counts: done by the task\'s own state, never by its run state', () => {
  it('a task in a done column counts as done whatever its run state; one not done counts by its run', () => {
    expect(countTasks([
      { status: 'DONE', runState: 'RUN_NONE' },
      { status: 'DONE', runState: 'RUN_ACTIVE' },
      { status: 'TODO', runState: 'RUN_NONE' },
      { status: 'TODO', runState: 'RUN_QUEUED' },
      { status: 'IN_PROGRESS', runState: 'RUN_THROTTLED' },
      { status: 'IN_PROGRESS', runState: 'RUN_ACTIVE' },
      { status: 'IN_PROGRESS', runState: 'RUN_BLOCKED' },
      { status: 'IN_PROGRESS', runState: 'RUN_FAILED' },
    ])).toEqual({ total: 8, done: 2, idle: 3, running: 1, blocked: 1, failed: 1 })
  })
})

describe('why a queued or throttled task has not started, in words (spec §6)', () => {
  it('its place in its agent\'s line', () => {
    expect(runWaitText({ kind: 'line', position: 2, agentName: 'AgentX', agentBusy: true })).toBe('2nd in line for AgentX')
    expect(runWaitText({ kind: 'line', position: 1, agentName: 'AgentX', agentBusy: true })).toBe('1st in line for AgentX')
    expect(runWaitText({ kind: 'line', position: 11, agentName: 'AgentX', agentBusy: true })).toBe('11th in line for AgentX')
    expect(runWaitText({ kind: 'line', position: 1, agentName: 'AgentX', agentBusy: false })).toBe('Starting for AgentX')
  })

  it('the next round, or automation being off', () => {
    expect(runWaitText({ kind: 'round', roundOpen: true, nextAt: null })).toMatch(/after the current one/)
    expect(runWaitText({ kind: 'round', roundOpen: false, nextAt: '2026-10-03T14:05:00Z' })).toMatch(/^Next round at /)
    expect(runWaitText({ kind: 'automationOff' })).toMatch(/Automation is off/)
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

describe("a throttled board's round line", () => {
  const base = { automationOn: true, open: false, agents: [], nextAt: null, throttled: 0 }
  it('the round in progress: each agent and how far it has got', () => {
    expect(roundLineText({ ...base, open: true, agents: [{ agentHandle: 'x', agentName: 'Xavier', done: 1, total: 3 }, { agentHandle: 'y', agentName: 'Yara', done: 0, total: 2 }] }))
      .toBe('Round in progress — Xavier 1 of 3 · Yara 0 of 2')
  })

  it('between rounds: when the next starts', () => {
    expect(roundLineText({ ...base, throttled: 4, nextAt: '2026-10-03T14:05:00Z' })).toMatch(/^Next round at .* — 4 throttled$/)
    expect(roundLineText(base)).toMatch(/when something is queued/)
  })

  it('automation off', () => {
    expect(roundLineText({ ...base, automationOn: false, throttled: 1 })).toBe('Automation is off — 1 throttled task waits for a person')
  })
})
