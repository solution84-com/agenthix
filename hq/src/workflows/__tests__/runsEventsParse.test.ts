import { describe, it, expect } from 'vitest'
import { WORKFLOW_STEP_EVENT_OUTPUT_MAX } from '@agenthix/core'
import { parseRunResult, parseStepEvent } from '../runsEventsParse'

const now = '2026-10-24T10:00:00.000Z'
const step = { runId: 'r1', index: 1, name: 'Upload', state: 'running', startedAt: now, endedAt: null, exitCode: null, outputTail: 'up', outputTruncated: false }
const result = {
  runId: 'r1', state: 'failed', startedAt: now, endedAt: now, failure: { code: 'secret_in_files', message: 'm' },
  steps: [{ index: 0, name: 'Build', state: 'passed', startedAt: now, endedAt: now, exitCode: 0, output: 'ok', outputTruncated: false }],
  printedSecretNames: ['KEY', 'KEY'], leaks: [{ path: 'a.txt', secretName: 'KEY' }], writeBack: null,
}

describe('a step event off the wire @SC-1295', () => {
  it('keeps a well-formed one', () => {
    expect(parseStepEvent(step)).toEqual(step)
  })

  it('drops one with a state, index or time it does not know', () => {
    expect(parseStepEvent({ ...step, state: 'exploded' })).toBeNull()
    expect(parseStepEvent({ ...step, index: -1 })).toBeNull()
    expect(parseStepEvent({ ...step, index: 50 })).toBeNull()
    expect(parseStepEvent({ ...step, startedAt: 'soon' })).toBeNull()
    expect(parseStepEvent({ ...step, runId: '' })).toBeNull()
    expect(parseStepEvent('nonsense')).toBeNull()
  })

  it('keeps the end of output that is too long, and says so', () => {
    const parsed = parseStepEvent({ ...step, outputTail: `start${'x'.repeat(WORKFLOW_STEP_EVENT_OUTPUT_MAX)}end` })
    expect(parsed?.outputTail.endsWith('end')).toBe(true)
    expect(parsed?.outputTail).toHaveLength(WORKFLOW_STEP_EVENT_OUTPUT_MAX)
    expect(parsed?.outputTruncated).toBe(true)
  })
})

describe('a run result off the wire @SC-1295', () => {
  it('keeps a well-formed one, each printed secret once', () => {
    expect(parseRunResult(result)).toEqual({ ...result, printedSecretNames: ['KEY'] })
  })

  it('drops one with a failure, a leak or a state it does not know', () => {
    expect(parseRunResult({ ...result, state: 'running' })).toBeNull()
    expect(parseRunResult({ ...result, failure: { code: 'boom', message: 'm' } })).toBeNull()
    expect(parseRunResult({ ...result, leaks: [{ path: 'a', secretName: 'not a name' }] })).toBeNull()
    expect(parseRunResult({ ...result, printedSecretNames: ['ok', 1] })).toBeNull()
    expect(parseRunResult({ ...result, writeBack: { changed: 'a' } })).toBeNull()
  })
})
