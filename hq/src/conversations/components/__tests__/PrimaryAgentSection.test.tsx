// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  primary: { data: undefined as unknown, error: null as unknown, dataUpdatedAt: 0, refetch: vi.fn() },
  save: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getPrimaryAgent: 'getPrimaryAgent',
  getAgents: 'getAgents',
  setPrimaryAgent: 'setPrimaryAgent',
  useAction: () => h.save,
  useQuery: (q: string) => (q === 'getPrimaryAgent'
    ? h.primary
    : { data: [{ id: 'k', name: 'Kernel' }, { id: 'w', name: 'Writer' }] }),
}))

import { PrimaryAgentSection } from '../PrimaryAgentSection'

beforeEach(() => {
  h.primary.refetch.mockReset().mockResolvedValue(undefined)
  h.save.mockReset().mockResolvedValue(undefined)
  h.primary.error = null
  h.primary.data = { agent: { id: 'k', name: 'Kernel', handle: 'kernel', avatarUrl: null }, isDefault: true }
})
afterEach(cleanup)

describe('the primary agent setting @SC-941 @SC-1929', () => {
  it('says it could not be read, with Try again, in place of Loading… when HQ did not answer', () => {
    h.primary.data = undefined
    h.primary.error = new Error('Network Error')
    render(<PrimaryAgentSection />)
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByText('Your primary agent could not be read')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.primary.refetch).toHaveBeenCalled()
  })

  it('shows Kernel as the default, with nothing to reset', () => {
    render(<PrimaryAgentSection />)
    expect((screen.getByLabelText('Primary agent') as HTMLSelectElement).value).toBe('k')
    expect(screen.queryByRole('button', { name: 'Reset to Kernel' })).toBeNull()
  })

  it('chooses another agent', async () => {
    render(<PrimaryAgentSection />)
    fireEvent.change(screen.getByLabelText('Primary agent'), { target: { value: 'w' } })
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ agentId: 'w' }))
    expect(screen.queryByText('Saved.')).toBeNull()
  })

  it('resets to Kernel once another is chosen', async () => {
    h.primary.data = { agent: { id: 'w', name: 'Writer', handle: 'writer', avatarUrl: null }, isDefault: false }
    render(<PrimaryAgentSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Kernel' }))
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ agentId: null }))
  })

  it('shows the server\'s reason when an agent may not be primary', async () => {
    h.save.mockRejectedValue(new Error('Only an agent that can start work can be your primary agent.'))
    render(<PrimaryAgentSection />)
    fireEvent.change(screen.getByLabelText('Primary agent'), { target: { value: 'w' } })
    expect((await screen.findByRole('alert')).textContent).toContain('can start work')
  })
})
