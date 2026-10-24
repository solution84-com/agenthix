import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ HttpError: class extends Error {}, prisma: {} }))
vi.mock('../../conversations/readingRule', () => ({ requireConversationReader: vi.fn() }))
vi.mock('../placeAccess', () => ({ mayReadPlace: vi.fn() }))

import { runCard } from '../conversationRuns'

const at = (s: string) => new Date(`2026-10-24T${s}Z`)
const step = (index: number, name: string, state: string, output = '') => ({ index, name, state, output })
const run = (state: string, steps: ReturnType<typeof step>[], over: Record<string, unknown> = {}) => ({
  id: 'r1', workflowId: 'w1', state, startedAt: at('10:00:00'), endedAt: null, workflow: { name: 'deploy' }, steps, ...over,
})

describe('a run\'s card in the conversation @SC-1299', () => {
  it('says the step a running run is on, of how many', () => {
    const c = runCard(run('RUNNING', [step(0, 'Build', 'PASSED'), step(1, 'Test', 'RUNNING'), step(2, 'Ship', 'WAITING')]))
    expect(c).toMatchObject({ state: 'running', stepNumber: 2, stepCount: 3, stepName: 'Test', failedStep: null, lastLine: null })
    expect(c.href).toBe('/workflows/w1/runs/r1')
  })

  it('names the failed step and the last line of its output', () => {
    const c = runCard(run('FAILED', [step(0, 'Build', 'PASSED'), step(1, 'Test', 'FAILED', 'compiling\n2 tests failed\n\n'), step(2, 'Ship', 'SKIPPED')], { endedAt: at('10:01:30') }))
    expect(c).toMatchObject({ state: 'failed', stepNumber: 2, failedStep: 'Test', lastLine: '2 tests failed', durationMs: 90_000 })
  })

  it('cuts a very long last line', () => {
    const c = runCard(run('FAILED', [step(0, 'Build', 'FAILED', 'x'.repeat(500))]))
    expect(c.lastLine!.length).toBeLessThanOrEqual(201)
  })

  it('gives a passed run its time and no failure', () => {
    const c = runCard(run('PASSED', [step(0, 'Build', 'PASSED')], { endedAt: at('10:00:42') }))
    expect(c).toMatchObject({ state: 'passed', failedStep: null, lastLine: null, durationMs: 42_000 })
  })
})
