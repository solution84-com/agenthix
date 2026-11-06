import { describe, expect, it } from 'vitest'
import { taskStateWords, type TaskStateInput } from '../taskStateWords'

const now = new Date('2026-11-06T10:00:00Z')
const base: TaskStateInput = { runState: 'RUN_NONE', done: false }
const say = (t: Partial<TaskStateInput>) => taskStateWords({ ...base, ...t }, now)

describe("a task's state, in T1's one set of words", () => {
  it('says Needs your okay, with Review, when an approval waits for the reader', () => {
    expect(say({ runState: 'RUN_BLOCKED', waitsOn: { what: 'okay', who: 'you' } })).toMatchObject({
      kind: 'okay', text: 'Needs your okay', tone: 'needs', nextStep: 'review', nextStepLabel: 'Review',
    })
  })

  it('reads a tool request stored on the task as an okay for the reader when nothing else is said', () => {
    expect(say({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' })).toMatchObject({ kind: 'okay', nextStep: 'review' })
  })

  it('says Asked you something, with Answer, when a question waits for the reader', () => {
    expect(say({ waitsOn: { what: 'answer', who: 'you' } })).toMatchObject({ kind: 'question', text: 'Asked you something', nextStep: 'answer', nextStepLabel: 'Answer' })
  })

  it('says Waiting, and on whom, when it waits on someone else, with no next step for the reader', () => {
    expect(say({ runState: 'RUN_BLOCKED', waitsOn: { what: 'okay', who: { name: 'Sam Okafor' } } })).toMatchObject({
      kind: 'waiting', text: 'Waiting · needs Sam Okafor’s okay', tone: 'muted', nextStep: null,
    })
    expect(say({ waitsOn: { what: 'answer', who: { name: 'Sam Okafor' } } }).text).toBe('Waiting · needs Sam Okafor’s answer')
  })

  it('says Failed with a short reason, the full one beside it, and Run again', () => {
    expect(say({ runState: 'RUN_FAILED', runStateReason: 'Model overloaded — the provider asked to retry later' })).toMatchObject({
      kind: 'failed', text: 'Failed · model overloaded', fullReason: 'Model overloaded — the provider asked to retry later',
      nextStep: 'runAgain', nextStepLabel: 'Run again',
    })
    expect(say({ runState: 'RUN_FAILED' })).toMatchObject({ text: 'Failed', fullReason: null, nextStep: 'runAgain' })
  })

  it('keeps a long reason short on the row', () => {
    const { text } = say({ runState: 'RUN_FAILED', runStateReason: 'x'.repeat(80) })
    expect(text.length).toBeLessThanOrEqual('Failed · '.length + 40)
    expect(text.endsWith('…')).toBe(true)
  })

  it('says Running with how long it has run', () => {
    expect(say({ runState: 'RUN_ACTIVE', workingSince: '2026-11-06T09:59:00Z' })).toMatchObject({ kind: 'running', text: 'Running · 1 min', tone: 'live', nextStep: null })
    expect(say({ runState: 'RUN_ACTIVE' }).text).toBe('Running')
  })

  it('says Waiting for a task queued or in line', () => {
    expect(say({ runState: 'RUN_QUEUED' }).text).toBe('Waiting')
    expect(say({ runState: 'RUN_THROTTLED' }).text).toBe('Waiting')
  })

  it('says Finished once its latest run completed and nothing is queued, and Not started before any run', () => {
    expect(say({ latestRunCompleted: true }).kind).toBe('finished')
    expect(say({ runState: 'RUN_QUEUED', latestRunCompleted: true }).kind).toBe('waiting')
    expect(say({}).text).toBe('Not started')
  })

  it('says Done in a done column, whatever its runs', () => {
    expect(say({ done: true, runState: 'RUN_FAILED', latestRunCompleted: true }).text).toBe('Done')
  })
})
