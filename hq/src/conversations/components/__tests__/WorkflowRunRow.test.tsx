// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ConversationRunCard } from '../../../workflows/conversationRuns'
import { WorkBar } from '../WorkBar'
import { runCardLine, WorkflowRunCard } from '../WorkflowRunRow'

afterEach(cleanup)

const card = (over: Partial<ConversationRunCard> = {}): ConversationRunCard => ({
  runId: 'r1', workflowId: 'w1', workflow: 'deploy', state: 'running', stepNumber: 2, stepCount: 3, stepName: 'Test',
  failedStep: null, lastLine: null, durationMs: null, endedAt: null, href: '/workflows/w1/runs/r1', ...over,
})
const actions = { canAct: true, busy: false, onStop: () => {}, onAnswer: () => {} }
const open = (runs: ConversationRunCard[]) => {
  render(<MemoryRouter><WorkBar rows={[]} liveLines={{}} actions={actions} workflowRuns={runs} /></MemoryRouter>)
  fireEvent.click(screen.getByTestId('work-bar').querySelector('button')!)
}

describe('a workflow run in the work bar @SC-1299', () => {
  it('counts a run under way as work, with its step and Follow the run', () => {
    open([card()])
    expect(screen.getByTestId('work-bar-heading').textContent).toBe('1 working')
    expect(screen.getByTestId('workflow-run-line').textContent).toBe('Step 2 of 3: Test')
    expect(screen.getByRole('link', { name: 'Follow the run' }).getAttribute('href')).toBe('/workflows/w1/runs/r1')
  })

  it('is absent when the conversation has no work and no runs', () => {
    render(<MemoryRouter><WorkBar rows={[]} liveLines={{}} actions={actions} workflowRuns={[]} /></MemoryRouter>)
    expect(screen.queryByTestId('work-bar')).toBeNull()
  })

  it('leaves a finished run to the thread: a bar with nothing else under way is absent', () => {
    render(<MemoryRouter><WorkBar rows={[]} liveLines={{}} actions={actions} workflowRuns={[card({ state: 'passed', endedAt: new Date() })]} /></MemoryRouter>)
    expect(screen.queryByTestId('work-bar')).toBeNull()
  })
})

describe('a finished workflow run in the thread @SC-1299', () => {
  it('shows a failed run with the failed step and its last line, and Open the run', () => {
    render(<MemoryRouter><WorkflowRunCard card={card({ state: 'failed', failedStep: 'Test', lastLine: '2 tests failed', durationMs: 90_000, endedAt: new Date() })} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Open the run' })).toBeTruthy()
    expect(screen.getByTestId('workflow-run-line').textContent).toContain('Failed at Test')
    expect(screen.getByTestId('workflow-run-last-line').textContent).toBe('2 tests failed')
  })

  it('shows a passed run with its time', () => {
    expect(runCardLine(card({ state: 'passed', durationMs: 42_000, endedAt: new Date() }))).toMatch(/^Passed in .*, today /)
  })
})
