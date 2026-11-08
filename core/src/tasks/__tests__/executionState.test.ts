import { describe, expect, it } from 'vitest'
import {
  EXECUTION_STATES, EXECUTION_STATE_LABELS, executionStateOf, needsPersonReason, needsThePerson,
  type ExecutionFacts,
} from '../executionState.js'

const none: ExecutionFacts = { inLine: false, latestRun: null, ask: null }

describe('the execution state of a task', () => {
  it('is Not started with no run and nothing pending', () => {
    expect(executionStateOf(none)).toBe('NOT_STARTED')
  })

  it('is Waiting while the task is in its agent\'s line, or due to start at its time', () => {
    expect(executionStateOf({ ...none, inLine: true })).toBe('WAITING')
  })

  it('is Waiting again after a failure once someone starts it once more', () => {
    expect(executionStateOf({ inLine: true, latestRun: { outcome: 'failed' }, ask: null })).toBe('WAITING')
  })

  it('is Running while its latest run is going', () => {
    expect(executionStateOf({ ...none, latestRun: { outcome: 'running' } })).toBe('RUNNING')
  })

  it('is Needs you while an ask is pending, whatever the run did', () => {
    for (const outcome of ['running', 'finished', 'failed', 'stopped'] as const) {
      expect(executionStateOf({ inLine: false, latestRun: { outcome }, ask: 'approval' }), outcome).toBe('NEEDS_YOU')
    }
    expect(executionStateOf({ ...none, ask: 'answer' })).toBe('NEEDS_YOU')
  })

  it('is Needs you when the run stopped at its time or turn limit, or its person lost access', () => {
    expect(executionStateOf({ ...none, latestRun: { outcome: 'finished' }, ask: 'limit' })).toBe('NEEDS_YOU')
    expect(executionStateOf({ ...none, ask: 'access' })).toBe('NEEDS_YOU')
  })

  it('is Failed when the latest run failed and it is not in line', () => {
    expect(executionStateOf({ ...none, latestRun: { outcome: 'failed' } })).toBe('FAILED')
  })

  it('is Finished when the latest run finished', () => {
    expect(executionStateOf({ ...none, latestRun: { outcome: 'finished' } })).toBe('FINISHED')
  })

  it('is Not started after a person stopped its run', () => {
    expect(executionStateOf({ ...none, latestRun: { outcome: 'stopped' } })).toBe('NOT_STARTED')
  })

  it('has a label for every state', () => {
    expect(EXECUTION_STATES.map(s => EXECUTION_STATE_LABELS[s]))
      .toEqual(['Not started', 'Waiting', 'Running', 'Needs you', 'Failed', 'Finished'])
  })
})

describe('what needs the person', () => {
  it('a task asking for an okay or an answer', () => {
    expect(needsPersonReason({ kind: 'task', taskState: 'IN_PROGRESS', ...none, ask: 'approval' })).toBe('approval')
    expect(needsPersonReason({ kind: 'task', taskState: 'TODO', ...none, ask: 'answer' })).toBe('answer')
  })

  it('a task asking stays even once it is Done: the ask is still waiting', () => {
    expect(needsPersonReason({ kind: 'task', taskState: 'DONE', ...none, ask: 'approval' })).toBe('approval')
  })

  it('a failed run of an open task', () => {
    expect(needsPersonReason({ kind: 'task', taskState: 'IN_PROGRESS', ...none, latestRun: { outcome: 'failed' } })).toBe('failed')
  })

  it('not a failed run of a task already Done, nor one taken back into line', () => {
    expect(needsThePerson({ kind: 'task', taskState: 'DONE', ...none, latestRun: { outcome: 'failed' } })).toBe(false)
    expect(needsThePerson({ kind: 'task', taskState: 'TODO', inLine: true, latestRun: { outcome: 'failed' }, ask: null })).toBe(false)
  })

  it('a routine run asking, or failed', () => {
    expect(needsPersonReason({ kind: 'routine', latestRun: { outcome: 'running' }, ask: 'answer' })).toBe('answer')
    expect(needsPersonReason({ kind: 'routine', latestRun: { outcome: 'failed' }, ask: null })).toBe('failed')
  })

  it('never an epic, which is never run', () => {
    expect(needsThePerson({ kind: 'task', taskState: 'TODO', typeKind: 'EPIC', ...none, latestRun: { outcome: 'failed' }, ask: 'approval' })).toBe(false)
  })

  it('nothing while a task runs, waits, or finished', () => {
    for (const outcome of ['running', 'finished', 'stopped'] as const) {
      expect(needsThePerson({ kind: 'task', taskState: 'IN_PROGRESS', ...none, latestRun: { outcome } }), outcome).toBe(false)
    }
    expect(needsThePerson({ kind: 'task', taskState: 'TODO', ...none, inLine: true })).toBe(false)
    expect(needsThePerson({ kind: 'routine', latestRun: { outcome: 'finished' }, ask: null })).toBe(false)
  })
})
