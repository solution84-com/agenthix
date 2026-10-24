// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const data = vi.hoisted(() => ({ run: null as unknown }))
const stop = vi.hoisted(() => vi.fn().mockResolvedValue({ stopped: true }))
const refetch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const live = vi.hoisted(() => ({ onChange: null as null | (() => void) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => (op === 'getWorkflowRun' ? { data: data.run, refetch } : { data: [] }),
  useAction: () => stop,
  getWorkflowRun: 'getWorkflowRun', stopWorkflowRun: 'stopWorkflowRun', getAgents: 'getAgents', getProjectMembers: 'getProjectMembers',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../components/useWorkflowRunLive', () => ({ useWorkflowRunLive: (_id: string, fn: () => void) => { live.onChange = fn } }))

import { RunView } from '../RunView'

const step = (index: number, name: string, state: string, output = '') => ({ index, name, state, durationMs: 41_000, exitCode: null, output, outputTruncated: false, startedAt: null, endedAt: null })
const run = (state: string, steps: ReturnType<typeof step>[], over: Record<string, unknown> = {}) => ({
  id: 'r1', workflow: 'deploy', version: 2, state, failure: null, agentId: null, onBehalfOfUserId: 'u1', printedSecret: false, leaks: [],
  startedAt: new Date(Date.now() - 72_000), durationMs: null, steps, ...over,
})
const place = { type: 'project' as const, id: 'p1' }

beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('a run', () => {
  it('shows one row per step, opens the running step to its output and offers Stop', () => {
    data.run = run('running', [step(0, 'Build', 'passed', 'built'), step(1, 'Migrate', 'running', 'Applying 0042'), step(2, 'Restart', 'waiting')])
    render(<RunView place={place} workflowId="w1" runId="r1" onBack={vi.fn()} />)
    expect(screen.getAllByTestId('run-step').map((s) => s.getAttribute('data-state'))).toEqual(['passed', 'running', 'waiting'])
    expect(screen.getAllByTestId('step-output')).toHaveLength(1)
    expect(screen.getByTestId('step-output').textContent).toBe('Applying 0042')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stop).toHaveBeenCalledWith({ runId: 'r1' })
  })

  it('opens the failed step of a failed run and offers no Stop', () => {
    data.run = run('failed', [step(0, 'Build', 'passed'), step(1, 'Push', 'failed', 'rejected'), step(2, 'Restart', 'skipped')], { failure: 'the branch has moved on' })
    render(<RunView place={place} workflowId="w1" runId="r1" onBack={vi.fn()} />)
    expect(screen.getByTestId('step-output').textContent).toBe('rejected')
    expect(screen.getByTestId('run-failure').textContent).toContain('Push failed.')
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('reads the run again when the socket says it changed', () => {
    data.run = run('running', [step(0, 'Build', 'running')])
    render(<RunView place={place} workflowId="w1" runId="r1" onBack={vi.fn()} />)
    live.onChange?.()
    expect(refetch).toHaveBeenCalled()
  })

  it('names a secret the scan found, for the people of the place', () => {
    data.run = run('failed', [step(0, 'Build', 'passed')], { leaks: [{ path: 'out.txt', secretName: 'KEY' }] })
    render(<RunView place={place} workflowId="w1" runId="r1" onBack={vi.fn()} />)
    expect(screen.getByTestId('run-leaks').textContent).toContain('out.txt (KEY)')
  })
})
