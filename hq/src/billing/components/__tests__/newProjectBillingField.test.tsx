// @vitest-environment jsdom
/** The new project form's billing field: shown only with two or more profiles, the default chosen, the pick sent. */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

import { CreateProjectModal } from '@agenthix/ui/projects'

const profiles = [{ id: 'p2', name: 'Client X', isDefault: false }, { id: 'p1', name: 'Fernhill', isDefault: true }]
const site = [{ siteId: 's1', name: 'Here', status: 'ONLINE' }]

function show(billingProfiles: typeof profiles | undefined, createProject = vi.fn().mockResolvedValue({ id: 'x' })) {
  render(<CreateProjectModal open onClose={() => undefined} sites={site} billingProfiles={billingProfiles} actions={{ createProject }} />)
  fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Onboarding' } })
  return createProject
}
afterEach(cleanup)

describe('the new project form @SC-1217', () => {
  it('shows no billing field with one profile, or none', () => {
    show([profiles[1]])
    expect(screen.queryByLabelText('AI cost billed to')).toBeNull()
  })

  it('sends no billing profile when the field is not shown', async () => {
    const create = show(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).not.toHaveProperty('billingProfileId')
  })

  it('defaults to the default profile, and sends the pick', async () => {
    const create = show(profiles)
    const field = screen.getByLabelText('AI cost billed to') as HTMLSelectElement
    expect(field.value).toBe('p1')
    expect(screen.getByText('After this, only an organisation admin can change it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create.mock.calls[0][0].billingProfileId).toBe('p1'))
  })

  it('sends the profile that was picked', async () => {
    const create = show(profiles)
    fireEvent.change(screen.getByLabelText('AI cost billed to'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create.mock.calls[0][0].billingProfileId).toBe('p2'))
  })
})
