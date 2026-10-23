// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ make: vi.fn(), navigate: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  createPersonalProject: { name: 'createPersonalProject' },
  useAction: () => h.make,
}))
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }))

import { NewProjectDialog } from '../NewProjectDialog'

beforeEach(() => {
  h.make.mockReset().mockResolvedValue({ id: 'p1', key: 'TAX' })
  h.navigate.mockReset()
})

describe('New project, for everyone @SC-1060', () => {
  it('shows a person who is not an organisation admin only the personal form, with no choice to make', async () => {
    const onClose = vi.fn()
    render(<NewProjectDialog open isOrgAdmin={false} onClose={onClose} onOrganisationProject={vi.fn()} />)
    expect(screen.queryByText('For the organisation')).toBeNull()
    expect(screen.queryByLabelText(/Site|Product|Members/)).toBeNull()
    const make = screen.getByRole('button', { name: 'Make it' }) as HTMLButtonElement
    expect(make.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Tax return 2026 ' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Receipts' } })
    fireEvent.click(make)
    await waitFor(() => expect(h.make).toHaveBeenCalledWith({ name: 'Tax return 2026', description: 'Receipts' }))
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/projects/TAX'))
    expect(onClose).toHaveBeenCalled()
  })

  it('offers an organisation admin both, and sends the organisation choice on to its own form', () => {
    const onOrganisationProject = vi.fn()
    render(<NewProjectDialog open isOrgAdmin onClose={vi.fn()} onOrganisationProject={onOrganisationProject} />)
    expect(screen.getByText('Just for you')).toBeTruthy()
    fireEvent.click(screen.getByText('For the organisation'))
    expect(onOrganisationProject).toHaveBeenCalled()
    expect(h.make).not.toHaveBeenCalled()
  })

  it('takes an organisation admin to the personal form by Just for you, and shows a refusal', async () => {
    h.make.mockRejectedValueOnce(new Error('No Execution Site is connected'))
    render(<NewProjectDialog open isOrgAdmin onClose={vi.fn()} onOrganisationProject={vi.fn()} />)
    fireEvent.click(screen.getByText('Just for you'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Side' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    expect((await screen.findByRole('alert')).textContent).toContain('No Execution Site is connected')
  })
})
