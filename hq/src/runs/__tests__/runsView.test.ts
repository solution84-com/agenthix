import { describe, it, expect } from 'vitest'
import { starterOf, groupOf, stateText, outcomeText, riskyCallCount, runGroup } from '../runsView'

const names = { users: new Map([['u1', 'ana']]), agents: new Map([['a1', 'Bot']]) }
const task = (over: Partial<Parameters<typeof starterOf>[0]> = {}) =>
  ({ runStartedBy: null, queuedByUserId: null, queuedByAgentId: null, ...over })

describe('starterOf @SC-530 @SC-649', () => {
  it('names the person who asked for the start', () => {
    expect(starterOf(task({ runStartedBy: 'person', queuedByUserId: 'u1' }), names)).toEqual({ kind: 'person', name: 'ana' })
  })
  it('names the agent that queued it', () => {
    expect(starterOf(task({ runStartedBy: 'agent', queuedByAgentId: 'a1' }), names)).toEqual({ kind: 'agent', name: 'Bot' })
  })
  it("calls a task's start time a schedule: a routine makes no task (adr-0177)", () => {
    expect(starterOf(task({ runStartedBy: 'schedule' }), names).kind).toBe('schedule')
  })
  it('calls the pulse automation, and an unrecorded start unknown', () => {
    expect(starterOf(task({ runStartedBy: 'pulse' }), names).kind).toBe('automation')
    expect(starterOf(task(), names).kind).toBe('unknown')
  })
})

describe('groupOf @SC-530', () => {
  it('is running while a run is going', () => {
    expect(groupOf({ status: 'RUNNING' }, 'RUN_ACTIVE')).toBe('running')
    expect(groupOf({ status: 'PENDING' }, 'RUN_ACTIVE')).toBe('running')
  })
  it('is waiting when a run stopped for a person: a tool request, or a blocked task', () => {
    expect(groupOf({ status: 'RUNNING', manifestStatus: 'PENDING_APPROVAL' }, 'RUN_BLOCKED')).toBe('waiting')
    expect(groupOf({ status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' }, null)).toBe('waiting')
    expect(groupOf({ status: 'CANCELLED' }, 'RUN_BLOCKED')).toBe('waiting')
  })
  it("is not waiting once a task's request was replaced: dismissed, run again, or a newer run @SC-643", () => {
    expect(groupOf({ status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' }, 'RUN_NONE')).toBe('finished')
    expect(groupOf({ status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' }, 'RUN_QUEUED')).toBe('queued')
    expect(groupOf({ status: 'COMPLETED', manifestStatus: 'SUPERSEDED' }, null)).toBe('finished')
  })
  it('is queued when the task waits, whatever its last run was', () => {
    expect(groupOf(null, 'RUN_QUEUED')).toBe('queued')
    expect(groupOf({ status: 'COMPLETED' }, 'RUN_THROTTLED')).toBe('queued')
  })
  it('is finished otherwise, a conversation included', () => {
    expect(groupOf({ status: 'COMPLETED' }, 'RUN_NONE')).toBe('finished')
    expect(groupOf({ status: 'COMPLETED' }, null)).toBe('finished')
  })
})

describe('stateText @SC-530 @SC-649', () => {
  const none = { runState: 'RUN_NONE', runStateReason: null }
  it('says how each finished run ended', () => {
    expect(stateText('finished', { status: 'COMPLETED' }, none)).toBe('done')
    expect(stateText('finished', { status: 'CANCELLED' }, none)).toBe('stopped')
    expect(stateText('finished', { status: 'FAILED', error: 'boom' }, none)).toBe('failed — boom')
    expect(stateText('finished', { status: 'FAILED' }, { runState: 'RUN_FAILED', runStateReason: 'no site' })).toBe('failed — no site')
  })
  it('says what a waiting run waits for', () => {
    expect(stateText('waiting', { status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' }, none)).toBe('wants approval')
    expect(stateText('waiting', { status: 'CANCELLED' }, { runState: 'RUN_BLOCKED', runStateReason: 'reached its 30 min limit' })).toBe('reached its 30 min limit')
    expect(stateText('waiting', null, { runState: 'RUN_BLOCKED', runStateReason: null })).toBe('needs you')
  })
  it('says nothing of a run going now', () => {
    expect(stateText('running', { status: 'RUNNING' }, none)).toBeNull()
  })
  it('shortens a long error', () => {
    expect(stateText('finished', { status: 'FAILED', error: 'x'.repeat(300) }, none)!.length).toBeLessThan(160)
  })
})

describe('a run on the Runs screen @SC-530', () => {
  it('says how it ended from the run itself', () => {
    expect(outcomeText({ status: 'COMPLETED' })).toBe('completed')
    expect(outcomeText({ status: 'FAILED', error: 'the build broke' })).toBe('failed — the build broke')
    expect(outcomeText({ status: 'FAILED' })).toBe('failed')
    expect(outcomeText({ status: 'CANCELLED', error: 'Stopped by Ana' })).toBe('stopped by Ana')
    expect(outcomeText({ status: 'CANCELLED', error: 'Cancelled by user' })).toBe('stopped')
    expect(outcomeText({ status: 'RUNNING' })).toBeNull()
  })

  it('files a run by what it is doing, and a request waits only while its task is blocked on it', () => {
    expect(runGroup({ status: 'RUNNING' }, 'RUN_ACTIVE')).toBe('running')
    expect(runGroup({ status: 'CANCELLED', manifestStatus: 'PENDING_APPROVAL' }, 'RUN_BLOCKED')).toBe('waiting')
    expect(runGroup({ status: 'CANCELLED', manifestStatus: 'PENDING_APPROVAL' }, null)).toBe('waiting')
    expect(runGroup({ status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' }, 'RUN_NONE')).toBe('finished')
    expect(runGroup({ status: 'COMPLETED' }, 'RUN_NONE')).toBe('finished')
  })

  it('counts the High and Flagged calls its audit summary holds', () => {
    expect(riskyCallCount({ bySeverity: { SAFE: 5, HIGH: 1, FLAGGED: 2 } })).toBe(3)
    expect(riskyCallCount({ bySeverity: {} })).toBe(0)
    expect(riskyCallCount(null)).toBeNull()
  })
})
