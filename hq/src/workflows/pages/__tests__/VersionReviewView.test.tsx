// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const data = vi.hoisted(() => ({ workflow: null as unknown, version: null as unknown }))
const approve = vi.hoisted(() => vi.fn().mockResolvedValue({ number: 2, enabled: true }))
const decline = vi.hoisted(() => vi.fn().mockResolvedValue({ number: 2 }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => (op === 'getWorkflow' ? { data: data.workflow } : op === 'getWorkflowVersion' ? { data: data.version } : { data: [] }),
  useAction: (op: string) => (op === 'approveWorkflowVersion' ? approve : decline),
  getWorkflow: 'getWorkflow', getWorkflowVersion: 'getWorkflowVersion', approveWorkflowVersion: 'approveWorkflowVersion',
  declineWorkflowVersion: 'declineWorkflowVersion', getAgents: 'getAgents', getProjectMembers: 'getProjectMembers',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))

import { VersionReviewView } from '../VersionReviewView'

const HASH = 'a'.repeat(64)
const definition = { name: 'w', description: '', steps: [{ name: 'Restart', run: 'ssh x', secrets: ['KEY'], timeoutSeconds: null }], variables: [], parameters: [], hosts: [], github: {}, timeoutSeconds: 600, files: [] }
const place = { type: 'project' as const, id: 'p1' }
const setup = (mayAdminister: boolean, state = 'PROPOSED') => {
  data.workflow = { name: 'deploy', mayAdminister, versions: [{ number: 2, origin: 'PROPOSED', proposedByAgentId: null }] }
  data.version = {
    number: 2, hash: HASH, state, definition, files: [], approvedNumber: 1, needsApprovalAgain: null,
    reviewLevel: 'LOW', reviewPoints: { points: [{ file: 'workflow.yaml', line: 18, text: 'Adds step 5' }] },
    checkSummary: 'Adds step 5. Gives it KEY.', checkFlags: [{ rule: 3, high: false, message: 'step 5 newly gets KEY' }],
    diff: { files: [{ path: 'workflow.yaml', change: 'changed', modeChanged: false, binary: false, lines: [{ kind: 'same', text: 'a' }, { kind: 'added', text: 'b' }] }], settings: [{ setting: 'steps[0]', before: '', after: 'Restart' }] },
  }
}
const props = { place, workflowId: 'w1', number: 2, against: null, onBack: vi.fn(), onDecided: vi.fn() }

beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('the full review @SC-1289', () => {
  it('shows the reviewer first, then the checks and the changes', () => {
    setup(true)
    render(<VersionReviewView {...props} />)
    const order = [screen.getByTestId('review-points'), screen.getByTestId('review-checks'), screen.getByTestId('diff-settings')]
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/Adds step 5 \(/)).toBeTruthy()
    expect(screen.getByText('step 5 newly gets KEY', { exact: false })).toBeTruthy()
  })

  it('approves exactly the version shown, by its hash', async () => {
    setup(true)
    render(<VersionReviewView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve version 2' }))
    await waitFor(() => expect(props.onDecided).toHaveBeenCalled())
    expect(approve).toHaveBeenCalledWith({ workflowId: 'w1', hash: HASH, via: 'review' })
  })

  it('declines by hash', async () => {
    setup(true)
    render(<VersionReviewView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(decline).toHaveBeenCalledWith({ workflowId: 'w1', hash: HASH }))
  })

  it('offers no decision to someone who may not make it, or on a version already decided', () => {
    setup(false)
    const { unmount } = render(<VersionReviewView {...props} />)
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull()
    unmount()
    setup(true, 'APPROVED')
    render(<VersionReviewView {...props} />)
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull()
  })
})
