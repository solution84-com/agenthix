// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ personal: vi.fn(), shared: vi.fn(), navigate: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  createPersonalProject: 'createPersonalProject',
  createProject: 'createProject',
  useAction: (op: string) => (op === 'createPersonalProject' ? h.personal : h.shared),
}))
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }))

import { NewProjectDialog, newProjectFields, type NewProjectBillingProfile, type NewProjectSite } from '../NewProjectDialog'

const ONE_SITE: NewProjectSite[] = [{ siteId: 's1', label: 'fernhill-hq', isDefault: true }]
const TWO_SITES: NewProjectSite[] = [{ siteId: 's2', label: 'build-box', isDefault: false }, ...ONE_SITE]
const ONE_PROFILE: NewProjectBillingProfile[] = [{ id: 'b1', name: 'Fernhill', isDefault: true }]
const TWO_PROFILES: NewProjectBillingProfile[] = [{ id: 'b2', name: 'Client X', isDefault: false }, ...ONE_PROFILE]

function show(o: { isOrgAdmin?: boolean; sites?: NewProjectSite[]; profiles?: NewProjectBillingProfile[]; onClose?: () => void } = {}) {
  render(
    <NewProjectDialog
      open onClose={o.onClose ?? vi.fn()} isOrgAdmin={o.isOrgAdmin ?? false}
      sites={o.sites ?? ONE_SITE} billingProfiles={o.profiles ?? ONE_PROFILE} existingKeys={[]}
    />,
  )
}
const name = (value: string) => fireEvent.change(screen.getByLabelText('Name'), { target: { value } })
const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

beforeEach(() => {
  h.personal.mockReset().mockResolvedValue({ id: 'p1', key: 'TAX' })
  h.shared.mockReset().mockResolvedValue({ id: 'p2', key: 'IR' })
  h.navigate.mockReset()
})
afterEach(cleanup)

describe('which choices New project draws @SC-310 @SC-1217', () => {
  it('draws Where it runs only for an organisation project, with more than one site', () => {
    expect(newProjectFields({ kind: 'organisation', siteCount: 2, profileCount: 1, isOrgAdmin: false }).site).toBe(true)
    expect(newProjectFields({ kind: 'organisation', siteCount: 1, profileCount: 1, isOrgAdmin: false }).site).toBe(false)
    expect(newProjectFields({ kind: 'personal', siteCount: 3, profileCount: 1, isOrgAdmin: true }).site).toBe(false)
  })

  it('draws AI cost billed to only for an organisation admin, with two or more profiles, on an organisation project', () => {
    expect(newProjectFields({ kind: 'organisation', siteCount: 1, profileCount: 2, isOrgAdmin: true }).billing).toBe(true)
    expect(newProjectFields({ kind: 'organisation', siteCount: 1, profileCount: 2, isOrgAdmin: false }).billing).toBe(false)
    expect(newProjectFields({ kind: 'organisation', siteCount: 1, profileCount: 1, isOrgAdmin: true }).billing).toBe(false)
    expect(newProjectFields({ kind: 'personal', siteCount: 1, profileCount: 2, isOrgAdmin: true }).billing).toBe(false)
  })
})

describe('New project, one form for every member @SC-310 @SC-1207', () => {
  it('offers a member both choices, and makes an organisation project, opening its overview', async () => {
    const onClose = vi.fn()
    show({ onClose })
    expect(screen.getByLabelText(/Just you/)).toBeTruthy()
    expect(screen.getByLabelText(/The organisation/)).toBeTruthy()
    expect(screen.queryByLabelText('Where it runs')).toBeNull()
    expect(screen.queryByLabelText('AI cost billed to')).toBeNull()
    expect(screen.queryByText(/Claude|Organisation admins only/)).toBeNull()
    name(' Intranet refresh ')
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Pages' } })
    create()
    await waitFor(() => expect(h.shared).toHaveBeenCalledWith({ name: 'Intranet refresh', description: 'Pages' }))
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/projects/IR'))
    expect(onClose).toHaveBeenCalled()
  })

  it('makes a personal project with Just you, sending no site or billing profile', async () => {
    show({ isOrgAdmin: true, sites: TWO_SITES, profiles: TWO_PROFILES })
    fireEvent.click(screen.getByLabelText(/Just you/))
    expect(screen.queryByLabelText('Where it runs')).toBeNull()
    expect(screen.queryByLabelText('AI cost billed to')).toBeNull()
    name('Tax return 2026')
    create()
    await waitFor(() => expect(h.personal).toHaveBeenCalledWith({ name: 'Tax return 2026', description: undefined }))
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/projects/TAX'))
  })

  it('lets the key follow the name until the person types in it, and sends only a typed key', async () => {
    show()
    const key = screen.getByLabelText('Key') as HTMLInputElement
    name('Website')
    expect(key.value).not.toBe('')
    fireEvent.change(key, { target: { value: 'qrs' } })
    name('Website redesign')
    expect(key.value).toBe('QRS')
    expect(screen.getByText('Task numbers read QRS-1, QRS-2…')).toBeTruthy()
    create()
    await waitFor(() => expect(h.shared).toHaveBeenCalledWith(expect.objectContaining({ key: 'QRS' })))
  })

  it('with two sites, offers Where it runs with HQ’s own chosen, and sends the pick', async () => {
    show({ sites: TWO_SITES })
    const site = screen.getByLabelText('Where it runs') as HTMLSelectElement
    expect(site.value).toBe('s1')
    expect(screen.getByText("fernhill-hq · HQ's site")).toBeTruthy()
    fireEvent.change(site, { target: { value: 's2' } })
    name('Intranet refresh')
    create()
    await waitFor(() => expect(h.shared).toHaveBeenCalledWith(expect.objectContaining({ siteId: 's2' })))
  })

  it('shows an organisation admin AI cost billed to with the default chosen, and sends the pick', async () => {
    show({ isOrgAdmin: true, profiles: TWO_PROFILES })
    const billing = screen.getByLabelText('AI cost billed to') as HTMLSelectElement
    expect(billing.value).toBe('b1')
    fireEvent.change(billing, { target: { value: 'b2' } })
    name('Intranet refresh')
    create()
    await waitFor(() => expect(h.shared).toHaveBeenCalledWith(expect.objectContaining({ billingProfileId: 'b2' })))
  })

  it('never sends a billing profile for a member', async () => {
    show({ profiles: TWO_PROFILES })
    name('Intranet refresh')
    create()
    await waitFor(() => expect(h.shared).toHaveBeenCalled())
    expect(h.shared.mock.calls[0][0]).not.toHaveProperty('billingProfileId')
  })

  it('says a refusal in a dialog with Try again, and keeps the form', async () => {
    h.shared.mockRejectedValueOnce(new Error('Project key "IR" is already in use'))
    show()
    name('Intranet refresh')
    create()
    expect((await screen.findByTestId('attention-text')).textContent).toContain('already in use')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(h.shared).toHaveBeenCalledTimes(2))
    expect(h.navigate).toHaveBeenCalledWith('/projects/IR')
  })
})
