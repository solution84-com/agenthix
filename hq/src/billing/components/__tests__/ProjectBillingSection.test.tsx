// @vitest-environment jsdom
/** A project's billing line in Settings: hidden with one profile, read-only for members, changeable by organisation admins. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ data: {} as Record<string, unknown>, actions: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('wasp/client/operations', () => ({
  getProjectBilling: 'getProjectBilling', getBillingProfileChoices: 'getBillingProfileChoices', setProjectBillingProfile: 'setProjectBillingProfile',
  useQuery: (op: string) => ({ data: h.data[op] }),
  useAction: (op: string) => (h.actions[op] ??= vi.fn().mockResolvedValue({})),
}))

import { ProjectBillingSection } from '../ProjectBillingSection'

const choices = [{ id: 'p1', name: 'Fernhill', isDefault: true }, { id: 'p2', name: 'Client X', isDefault: false }]
const billing = (mayChange: boolean) => ({
  billingProfile: choices[1], mayChange, lastChange: { byName: 'Sam', at: '2026-10-23T09:00:00Z', fromName: 'Fernhill' },
})
beforeEach(() => { h.data = { getBillingProfileChoices: choices, getProjectBilling: billing(true) } })
afterEach(() => { cleanup(); h.data = {}; h.actions = {} })

describe('a project billing section', () => {
  it('lets an organisation admin change it, from the next call', async () => {
    render(<ProjectBillingSection projectId="pr1" />)
    const select = screen.getByLabelText('AI cost billed to') as HTMLSelectElement
    expect(select.value).toBe('p2')
    expect(screen.getByText(/From the next call\. Changed by Sam on .* from Fernhill\./)).toBeTruthy()
    fireEvent.change(select, { target: { value: 'p1' } })
    await waitFor(() => expect(h.actions.setProjectBillingProfile).toHaveBeenCalledWith({ projectId: 'pr1', billingProfileId: 'p1' }))
  })

  it('shows anyone else the profile as text', () => {
    h.data.getProjectBilling = billing(false)
    render(<ProjectBillingSection projectId="pr1" />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Client X')).toBeTruthy()
    expect(screen.getByText(/Set by organisation admins/)).toBeTruthy()
  })

  it('shows nothing when there is only one billing profile', () => {
    h.data.getBillingProfileChoices = [choices[0]]
    const { container } = render(<ProjectBillingSection projectId="pr1" />)
    expect(container.textContent).toBe('')
  })

  it('shows the problem when the change is refused', async () => {
    render(<ProjectBillingSection projectId="pr1" />)
    ;(h.actions.setProjectBillingProfile ??= vi.fn()).mockRejectedValue(new Error('Only an organisation admin changes it.'))
    fireEvent.change(screen.getByLabelText('AI cost billed to'), { target: { value: 'p1' } })
    expect((await screen.findByRole('alert')).textContent).toContain('Only an organisation admin')
  })
})
