// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { OperationActivityView } from '../../../shared/conversations/protocol'
import { WorkBar } from '../WorkBar'

afterEach(cleanup)

type Card = NonNullable<OperationActivityView['workflowCard']>
const card = (over: Partial<Card> = {}): Card => ({
  workflowId: 'w1', workflow: 'deploy-staging', version: 2, hash: 'a'.repeat(64),
  summary: 'Since version 1: changes what step 1 runs.', reviewLevel: 'low',
  flags: [], mayApprove: true, canAnswer: true, ...over,
})
const row = (c: Card): OperationActivityView => ({
  operationId: 'o1', kind: 'TOOL', title: 'Approve version 2 of deploy-staging', state: 'WAITING_FOR_APPROVAL', word: 'waiting',
  boundaryName: 'Shop', lines: [], endedHelpers: 0, canStop: true, createdAt: '2026-10-24T10:00:00.000Z',
  request: { what: 'approve version 2', reason: c.summary, askedBy: 'Kernel' }, workflowCard: c,
})
const answers: string[] = []
const open = (c: Card, canAct = true) => {
  render(<MemoryRouter><WorkBar rows={[row(c)]} liveLines={{}} actions={{ canAct, busy: false, onStop: () => {}, onAnswer: (_id, a) => { answers.push(a) } }} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /need|working|waiting/i }))
}

describe('a workflow version\'s approval card', () => {
  it('carries the summary, the reviewer\'s level and Approve when the plain checks allow it', () => {
    open(card())
    expect(screen.getByTestId('workflow-card-summary').textContent).toBe('Since version 1: changes what step 1 runs.')
    expect(screen.getByTestId('workflow-card-review').textContent).toContain('Low risk')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(answers).toEqual(['approve'])
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })

  it('offers only Review all of it, with the reason, when they do not, whatever the reviewer said', () => {
    open(card({ mayApprove: false, reason: 'Step 2 newly gets KEY.', flags: [{ rule: 9, high: true, message: 'This step runs code the agent can change after approval' }] }))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByTestId('workflow-card-reason').textContent).toBe('Step 2 newly gets KEY.')
    expect(screen.getByTestId('workflow-card-flags').textContent).toContain('High: This step runs code')
    expect(screen.getByRole('link', { name: 'Review all of it' }).getAttribute('href')).toBe('/workflows/w1/versions/2')
  })

  it('shows no buttons to someone who does not administer the place', () => {
    open(card({ canAnswer: false }))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review all of it' })).toBeNull()
  })
})
