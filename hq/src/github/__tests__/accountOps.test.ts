import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  mayAdminister: vi.fn(),
  mayRead: vi.fn(),
  accountsForPlace: vi.fn(),
  projectUpdate: vi.fn(),
  allow: vi.fn(),
}))
vi.mock('wasp/server', () => ({
  HttpError: class extends Error { constructor(public status: number, msg?: string) { super(msg) } },
  prisma: { project: { update: m.projectUpdate }, org: { findFirst: vi.fn() } },
}))
vi.mock('../../server/identity/requireRole', () => ({ requireRole: m.requireRole }))
vi.mock('../githubApp', () => ({ getApp: vi.fn(async () => ({ slug: 'app' })) }))
vi.mock('../githubFacts', () => ({ currentFacts: vi.fn(), refreshGitHubFacts: vi.fn() }))
vi.mock('../accountViews', () => ({ accountList: vi.fn(), accountsForPlace: m.accountsForPlace, GITHUB_POLL: { everyMs: 4000, forMs: 60000 } }))
vi.mock('../accountRules', () => ({ allowAccount: m.allow, changeAccountRule: vi.fn(), ignoreAccount: vi.fn() }))
vi.mock('../../workflows/placeAccess', () => ({ mayAdministerPlace: m.mayAdminister, mayReadPlace: m.mayRead }))

import { allowGitHubAccount, setProjectGitHubDefault, getGitHubInstallLink } from '../accountOps'

const ctx = { user: { id: 'u1' } }
beforeEach(() => {
  vi.clearAllMocks()
  m.requireRole.mockResolvedValue(undefined)
  m.mayAdminister.mockResolvedValue(true)
  m.accountsForPlace.mockResolvedValue({ accounts: [{ id: 'i1' }], defaultId: null })
})

describe('who may decide', () => {
  it('only an organisation administrator allows an account', async () => {
    m.requireRole.mockRejectedValue(new Error('no'))
    await expect(allowGitHubAccount({ id: 'i1', projectRule: 'EVERY_PROJECT' }, ctx)).rejects.toThrow()
    expect(m.allow).not.toHaveBeenCalled()
    m.requireRole.mockResolvedValue(undefined)
    await allowGitHubAccount({ id: 'i1', projectRule: 'EVERY_PROJECT' }, ctx)
    expect(m.allow).toHaveBeenCalledWith('i1', 'u1', expect.objectContaining({ projectRule: 'EVERY_PROJECT' }))
  })

  it('the install link also needs an organisation administrator', async () => {
    m.requireRole.mockRejectedValue(new Error('no'))
    await expect(getGitHubInstallLink({}, ctx)).rejects.toThrow()
  })
})

describe('a project\'s default account', () => {
  it('is set by a project administrator, from accounts the project may connect to', async () => {
    await setProjectGitHubDefault({ projectId: 'p1', installationId: 'i1' }, ctx)
    expect(m.projectUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { defaultGitHubInstallationId: 'i1' } })
  })

  it('refuses an account the project may not connect to, and anyone who isn\'t its administrator', async () => {
    await expect(setProjectGitHubDefault({ projectId: 'p1', installationId: 'other' }, ctx)).rejects.toThrow(/may not connect/)
    m.mayAdminister.mockResolvedValue(false)
    await expect(setProjectGitHubDefault({ projectId: 'p1', installationId: 'i1' }, ctx)).rejects.toThrow(/administrators/)
    expect(m.projectUpdate).not.toHaveBeenCalled()
  })

  it('can be cleared', async () => {
    await setProjectGitHubDefault({ projectId: 'p1', installationId: null }, ctx)
    expect(m.projectUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { defaultGitHubInstallationId: null } })
  })
})
