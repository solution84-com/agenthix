// @vitest-environment jsdom
/** *Which agents use it?*, the step that ends installing and publishing: every agent, chosen agents, or not yet. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const calls = { setEvery: vi.fn(), add: vi.fn(), remove: vi.fn(), refetch: vi.fn() }
const state: { holders: { everyAgent: boolean; agents: Array<{ id: string; name: string }> }; grant: boolean } = { holders: { everyAgent: false, agents: [] }, grant: true }

vi.mock('wasp/client/operations', () => ({
  getAssetPage: { name: 'getAssetPage' },
  getAssetHolders: { name: 'getAssetHolders' },
  setAssetEveryAgent: { name: 'setEvery' },
  addAssetToAgents: { name: 'add' },
  removeAssetFromAgent: { name: 'remove' },
  useQuery: (op: { name: string }) => op.name === 'getAssetPage'
    ? { data: { can: { grant: state.grant }, agents: [{ id: 'w', name: 'Writer' }, { id: 'r', name: 'Reviewer' }] } }
    : { data: state.holders, refetch: calls.refetch },
  useAction: (op: { name: string }) => ({ setEvery: calls.setEvery, add: calls.add, remove: calls.remove })[op.name as 'add'],
}))

import { WhichAgentsDialog } from '../WhichAgentsDialog'

beforeEach(() => {
  state.holders = { everyAgent: false, agents: [] }
  state.grant = true
  calls.setEvery.mockReset().mockResolvedValue({ everyAgent: false, agents: [] })
  calls.add.mockReset().mockResolvedValue({})
  calls.remove.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

const open = (onDone = vi.fn()) => { render(<WhichAgentsDialog assetId="a1" title="release-notes 1.2.0 is published" onDone={onDone} />); return onDone }

describe('Which agents use it? @SC-1625', () => {
  it('asks the question under the title, with every agent, chosen agents and not yet, and Not yet chosen for a skill no agent has', () => {
    open()
    expect(screen.getByRole('heading', { name: 'release-notes 1.2.0 is published' })).toBeTruthy()
    expect(screen.getByText('Which agents use it?')).toBeTruthy()
    expect((screen.getByRole('radio', { name: /^Not yet/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('radio', { name: /^Every agent/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Chosen agents/ })).toBeTruthy()
  })

  it('gives every agent the skill with the skill page’s own operation', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: /^Every agent/ }))
    await waitFor(() => expect(calls.setEvery).toHaveBeenCalledWith({ assetId: 'a1', everyAgent: true }))
  })

  it('adds a chosen agent from the choice of agents', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: /^Chosen agents/ }))
    fireEvent.change(screen.getByLabelText('Add an agent'), { target: { value: 'w' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(calls.add).toHaveBeenCalledWith({ assetId: 'a1', agentIds: ['w'] }))
  })

  it('starts on the agents that already use it, and Not yet takes them away', async () => {
    state.holders = { everyAgent: false, agents: [{ id: 'w', name: 'Writer' }] }
    open()
    expect((screen.getByRole('radio', { name: /^Chosen agents/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Writer')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /^Not yet/ }))
    await waitFor(() => expect(calls.remove).toHaveBeenCalledWith({ assetId: 'a1', agentId: 'w' }))
  })

  it('does not change anything for Not yet on a skill no agent has, and Done closes it', () => {
    const done = open()
    fireEvent.click(screen.getByRole('radio', { name: /^Not yet/ }))
    expect(calls.setEvery).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(done).toHaveBeenCalled()
  })

  it('tells someone who may not choose that it is for administrators, and offers no choice', () => {
    state.grant = false
    open()
    expect(screen.getByText(/is for administrators/)).toBeTruthy()
    expect((screen.getByRole('radio', { name: /^Every agent/ }) as HTMLInputElement).disabled).toBe(true)
  })
})
