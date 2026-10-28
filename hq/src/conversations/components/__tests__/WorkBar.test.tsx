// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { OperationActivityView } from '../../../shared/conversations/protocol'
import { contextLine, WorkBar } from '../WorkBar'

// A request's detail under its card asks the server what an agent's skill request would change; none here is one.
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: { kind: 'none' } }), getAssetRequestChange: 'getAssetRequestChange' }))

afterEach(cleanup)

const use = { tokens: 144_000, summarisesAt: null, window: 200_000, at: '2026-10-17T10:00:00.000Z' }
const row = (over: Partial<OperationActivityView> = {}): OperationActivityView => ({
  operationId: 'o1', kind: 'WORKER', title: 'Profile the image pipeline', state: 'RUNNING', word: 'working',
  boundaryName: 'Shop', lines: [], endedHelpers: 0, canStop: true, createdAt: '2026-10-17T10:00:00.000Z', ...over,
})
const actions = { canAct: true, busy: false, onStop: () => {}, onAnswer: () => {} }
const open = (rows: OperationActivityView[], canAct = true) => {
  render(<MemoryRouter><WorkBar rows={rows} liveLines={{}} actions={{ ...actions, canAct }} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /working/ }))
}

describe('a row of the work bar @SC-1009', () => {
  it('shows how full the work\'s context is, and nothing when the figure is not known', () => {
    open([row({ contextUse: use })])
    expect(screen.getByTestId('work-bar-detail').textContent).toBe('Context 72% full')
    cleanup()
    open([row()])
    expect(screen.queryByTestId('work-bar-detail')).toBeNull()
    expect(contextLine(null)).toBeNull()
  })

  it('tells someone who may not answer a request that it waits for someone who can', () => {
    open([row({ state: 'WAITING_FOR_APPROVAL', request: { what: 'Run "wc"', reason: 'To count words', askedBy: 'Kernel' } })], false)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByTestId('work-bar-request').textContent).toContain('Waiting for someone who can write here to answer')
  })
})
