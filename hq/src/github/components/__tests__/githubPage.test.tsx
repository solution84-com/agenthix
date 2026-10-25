// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'

const actions = vi.hoisted(() => ({ allowGitHubAccount: vi.fn(), ignoreGitHubAccount: vi.fn(), changeGitHubAccountRule: vi.fn(), disconnectGithubApp: vi.fn() }))
const queries = vi.hoisted(() => ({ getProjects: [] as unknown, getOrgPeople: {} as unknown, getGitHubInstallLink: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: (queries as Record<string, unknown>)[op], isLoading: false }),
  useAction: (op: string) => (actions as Record<string, ReturnType<typeof vi.fn>>)[op] ?? vi.fn(),
  checkForGitHubAccounts: vi.fn().mockResolvedValue({ accounts: [], newInstallationIds: [] }),
  getProjects: 'getProjects', getOrgPeople: 'getOrgPeople', getGitHubInstallLink: 'getGitHubInstallLink',
  allowGitHubAccount: 'allowGitHubAccount', ignoreGitHubAccount: 'ignoreGitHubAccount', changeGitHubAccountRule: 'changeGitHubAccountRule',
  disconnectGithubApp: 'disconnectGithubApp',
}))

import { AccountsSection, type AccountsData } from '../AccountsSection'
import { AppSection } from '../AppSection'

const row = (over: Record<string, unknown>) => ({
  id: 'a', installationId: 1, login: 'acme', type: 'Organization', state: 'ALLOWED', projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [], decidedAt: null,
  acceptedPermissions: { contents: 'write' }, reach: { selection: 'all', canCreateRepository: true, words: '' }, ...over,
})
const data = (accounts: unknown[]): AccountsData => ({ slug: 'agenthix-1', appPermissions: { contents: 'write', issues: 'write' }, accounts: accounts as AccountsData['accounts'], poll: { everyMs: 4000, forMs: 60000 } })

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  queries.getProjects = [{ id: 'p1', key: 'N', name: 'North website', personalOwnerId: null }]
  queries.getOrgPeople = { people: [{ person: { userId: 'u1', name: 'Sam', state: 'active' } }] }
})

describe('the accounts section @SC-1309', () => {
  it('shows what an account can reach, whether it accepted the latest permissions, and who can connect', () => {
    render(<AccountsSection data={data([
      row({}),
      row({ id: 'b', installationId: 2, login: 'acme-archive', reach: { selection: 'selected', canCreateRepository: false, words: '' }, projectRule: 'CHOSEN_PROJECTS', projectIds: ['p1'] }),
    ])} onChanged={vi.fn()} />)
    const rows = screen.getAllByTestId('account-row')
    expect(rows[0].textContent).toContain('All repositories')
    expect(rows[0].textContent).toContain('Not yet accepted')
    expect(rows[0].textContent).toContain('Issues: write')
    expect(rows[0].textContent).toContain('Every project')
    expect(rows[1].textContent).toContain('Selected repositories only')
    expect(rows[1].textContent).toContain("Can't create new repositories")
    expect(rows[1].textContent).toContain('Only: North website')
    expect(screen.queryByRole('button', { name: /Refresh/ })).toBeNull()
  })

  it('shows a new installation as wanting to connect, and allowing it takes a rule with no people by default', async () => {
    actions.allowGitHubAccount.mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    render(<AccountsSection data={data([row({ id: 'n', login: 'north-ltd', state: 'WANTS_TO_CONNECT' })])} onChanged={onChanged} />)
    const card = screen.getByTestId('wants-to-connect')
    expect(card.textContent).toContain('north-ltd wants to connect')
    fireEvent.click(within(card).getByRole('button', { name: 'Allow' }))
    const dialog = screen.getByTestId('allow-dialog')
    expect(dialog.textContent).toContain('Every project')
    expect((within(dialog).getByRole('checkbox', { name: 'Sam' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(actions.allowGitHubAccount).toHaveBeenCalledWith({ id: 'n', projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [] }))
    expect(onChanged).toHaveBeenCalled()
  })

  it('searches the projects, and leaves personal projects to People', () => {
    queries.getProjects = [
      { id: 'p1', key: 'N', name: 'North website', personalOwnerId: null },
      { id: 'p2', key: 'S', name: 'South shop', personalOwnerId: null },
      { id: 'p3', key: 'M', name: "Sam's work", personalOwnerId: 'u1' },
    ]
    render(<AccountsSection data={data([row({ id: 'n', login: 'north-ltd', state: 'WANTS_TO_CONNECT' })])} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    const dialog = screen.getByTestId('allow-dialog')
    fireEvent.click(within(dialog).getByLabelText(/Only chosen projects/))
    expect(within(dialog).queryByRole('checkbox', { name: "Sam's work" })).toBeNull()
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'south' } })
    expect(within(dialog).queryByRole('checkbox', { name: 'North website' })).toBeNull()
    expect(within(dialog).getByRole('checkbox', { name: 'South shop' })).toBeTruthy()
  })

  it('chooses projects for a client\'s account', async () => {
    actions.allowGitHubAccount.mockResolvedValue({ ok: true })
    render(<AccountsSection data={data([row({ id: 'n', login: 'north-ltd', state: 'WANTS_TO_CONNECT' })])} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    const dialog = screen.getByTestId('allow-dialog')
    fireEvent.click(within(dialog).getByLabelText(/Only chosen projects/))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'North website' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(actions.allowGitHubAccount).toHaveBeenCalledWith({ id: 'n', projectRule: 'CHOSEN_PROJECTS', projectIds: ['p1'], userIds: [] }))
  })

  it('ignores a new installation', async () => {
    actions.ignoreGitHubAccount.mockResolvedValue({ ok: true })
    render(<AccountsSection data={data([row({ id: 'n', login: 'north-ltd', state: 'WANTS_TO_CONNECT' })])} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }))
    await waitFor(() => expect(actions.ignoreGitHubAccount).toHaveBeenCalledWith({ id: 'n' }))
  })
})

describe('the App section @SC-1308', () => {
  it('lists the real permissions with what uses each, and links to change them on GitHub', () => {
    render(<AppSection slug="agenthix-1" permissions={{ contents: 'write', pull_requests: 'write' }} settingsUrl="https://github.com/settings/apps/agenthix-1/permissions" onChanged={vi.fn()} />)
    const list = screen.getByRole('list', { name: "The App's permissions" })
    expect(list.textContent).toContain('Code: write')
    expect(list.textContent).toContain('push, pull')
    expect(list.textContent).toContain('open-pull-request')
    expect(screen.getByText(/each run gets a token with only what its workflow declares/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Change on GitHub/ }).getAttribute('href')).toContain('/settings/apps/agenthix-1/permissions')
  })

  it('says who owns the App on GitHub, and when it is a personal account', () => {
    const { rerender } = render(<AppSection slug="agenthix-1" owner={{ login: 'solution84-test', type: 'Organization' }} permissions={{}} settingsUrl="u" onChanged={vi.fn()} />)
    expect(screen.getByText(/owned by/).textContent).toBe('owned by solution84-test')
    rerender(<AppSection slug="agenthix-1" owner={{ login: 'lhengl', type: 'User' }} permissions={{}} settingsUrl="u" onChanged={vi.fn()} />)
    expect(screen.getByText(/owned by/).textContent).toBe('owned by lhengl (a personal account)')
  })
})
