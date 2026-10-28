// @vitest-environment jsdom
/** Updating and rolling back (board U5): every agent from its next turn, the old version stays, a withdrawn one needs its warning accepted. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const update = vi.fn()
const rollBack = vi.fn()
vi.mock('wasp/client/operations', () => ({
  acceptAssetUpdate: { name: 'u' }, rollBackAsset: { name: 'r' },
  useAction: (op: { name: string }) => (op.name === 'u' ? update : rollBack),
}))

import { MoveDialog } from '../../asset/dialogs/MoveDialog'

beforeEach(() => { update.mockReset().mockResolvedValue({}); rollBack.mockReset().mockResolvedValue({}) })
afterEach(cleanup)

describe('rolling back', () => {
  it('says every agent that has it uses the earlier version from its next turn, and that the newer one stays in the history', async () => {
    const done = vi.fn()
    render(<MoveDialog mode="rollBack" assetId="a1" title="Code Review" inUse="1.4.0" target={{ id: 'v1', version: '1.3.0', withdrawn: null }} onClose={() => {}} onDone={done} />)
    expect(screen.getByRole('heading', { name: 'Go back to Code Review 1.3.0?' })).toBeTruthy()
    expect(screen.getByText(/Every agent that has it uses 1\.3\.0 from its next turn\. 1\.4\.0 stays in the history/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go back to 1.3.0' }))
    await waitFor(() => expect(done).toHaveBeenCalledWith('Code Review went back to 1.3.0.'))
    expect(rollBack).toHaveBeenCalledWith({ assetId: 'a1', versionId: 'v1', reason: undefined, withdrawnAccepted: false })
  })
})

describe('updating to a version the publisher withdrew', () => {
  it('shows why, and does not move until the warning is accepted', async () => {
    render(<MoveDialog mode="update" assetId="a1" title="Code Review" inUse="1.3.0" target={{ id: 'v2', version: '1.4.0', withdrawn: 'It tells agents to push to main.' }} onClose={() => {}} onDone={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain('The publisher withdrew 1.4.0: It tells agents to push to main.')
    const go = screen.getByRole('button', { name: 'Update to 1.4.0' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('I want 1.4.0 anyway'))
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() => expect(update).toHaveBeenCalledWith({ assetId: 'a1', versionId: 'v2', reason: undefined, withdrawnAccepted: true }))
  })

  it("shows the server's refusal and changes nothing on screen", async () => {
    update.mockRejectedValue(new Error('Someone changed the version in use at the same moment. Look at it again. Nothing was changed.'))
    render(<MoveDialog mode="update" assetId="a1" title="Code Review" inUse="1.3.0" target={{ id: 'v2', version: '1.4.0', withdrawn: null }} onClose={() => {}} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update to 1.4.0' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.'))
  })
})
