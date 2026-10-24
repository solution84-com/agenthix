/** What is checked before a repository is created or connected, and the cleanup of one that was created. */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({
  prisma: {},
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../mintGateConnect', () => ({ chooseConnectInstallation: vi.fn(), mintForConnecting: vi.fn(), mintForCreating: vi.fn() }))
vi.mock('../mintGate', () => ({ revokeGateToken: vi.fn() }))
vi.mock('../accountViews', async () => ({ reachOf: (await vi.importActual<typeof import('../accountViews')>('../accountViews')).reachOf }))
vi.mock('../permissionFacts', () => ({ recalledFacts: () => ({ accounts: new Map() }) }))
vi.mock('../../diagnostics/recordedErrors', () => ({ recordError: vi.fn() }))
vi.mock('../../storage/github', async () => {
  const actual = await vi.importActual<typeof import('../../storage/github')>('../../storage/github')
  return { ...actual, createGitHubRepo: vi.fn() }
})

import { HttpError } from 'wasp/server'
import { checkConnect, type CheckDeps } from '../connectChecks'
import { undoCreatedRepository, type NewRepositoryDeps } from '../connectNewRepository'
import type { RuledInstallation } from '../connectRule'

const PLACE = { type: 'project' as const, id: 'p1' }
const inst = (over: Partial<RuledInstallation> = {}): RuledInstallation => ({
  id: 'row1', installationId: 11, accountId: 7, accountLogin: 'acme', accountType: 'Organization', repositorySelection: 'all',
  rule: { state: 'ALLOWED', projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [] }, ...over,
})
const ask = { place: PLACE, person: 'u1', kind: 'new' as const, name: 'Web App' }

let deps: CheckDeps
let revoked: string[]

beforeEach(() => {
  revoked = []
  deps = {
    choose: vi.fn(async () => inst()),
    repositoryExists: vi.fn(async () => null),
    mintForCreating: vi.fn(async () => ({ token: 'ghs_admin', installation: inst() as never })),
    mintForConnecting: vi.fn(async () => ({ token: 'ghs_read' }) as never),
    revoke: vi.fn(async (t: string) => { revoked.push(t) }),
    accepted: () => undefined,
  }
})

describe('checking a new repository', () => {
  it('passes for an organisation on all repositories with a free name, and ends its token', async () => {
    const res = await checkConnect(ask, deps)
    expect(res).toEqual({ ok: true, account: { id: 'row1', login: 'acme' }, problem: null, useExisting: null })
    expect(deps.repositoryExists).toHaveBeenCalledWith('ghs_admin', 'acme', 'web-app')
    expect(revoked).toEqual(['ghs_admin'])
  })

  it('is not offered for selected repositories, and says how to fix it and who can', async () => {
    deps.choose = vi.fn(async () => inst({ repositorySelection: 'selected' }))
    const res = await checkConnect(ask, deps)
    expect(res.ok).toBe(false)
    expect(res.problem?.kind).toBe('selected_repositories')
    expect(res.problem?.words).toMatch(/Repository access to All repositories/)
    expect(res.problem?.words).toMatch(/add it to the selection there, and connect it here as an existing repository/)
    expect(res.problem?.words).toMatch(/Only an owner of that GitHub account/)
    expect(res.problem?.words).toMatch(/Nothing was changed\.$/)
    expect(deps.mintForCreating).not.toHaveBeenCalled()
  })

  it('is not offered for a personal account', async () => {
    deps.choose = vi.fn(async () => inst({ accountType: 'User' }))
    expect((await checkConnect(ask, deps)).problem?.kind).toBe('personal_account')
  })

  it('is not offered when the account has not accepted the permission to create', async () => {
    deps.accepted = () => ({ contents: 'write' })
    expect((await checkConnect(ask, deps)).problem?.kind).toBe('no_administration')
  })

  it('offers the existing repository when the name is taken', async () => {
    deps.repositoryExists = vi.fn(async () => ({ repoUrl: 'https://github.com/acme/web-app', id: 5 }))
    const res = await checkConnect(ask, deps)
    expect(res.ok).toBe(false)
    expect(res.problem?.kind).toBe('name_taken')
    expect(res.useExisting).toEqual({ repoUrl: 'https://github.com/acme/web-app' })
    expect(revoked).toEqual(['ghs_admin'])
  })

  it('refuses a name with nothing in it before minting anything', async () => {
    expect((await checkConnect({ ...ask, name: ' !! ' }, deps)).problem?.kind).toBe('bad_name')
    expect(deps.mintForCreating).not.toHaveBeenCalled()
  })

  it('asks which account when the place may connect to several, and says when it may connect to none', async () => {
    deps.choose = vi.fn(async () => { throw new HttpError(409, 'Choose which GitHub account to connect. Nothing was changed.') })
    expect((await checkConnect(ask, deps)).problem?.kind).toBe('choose_account')
    deps.choose = vi.fn(async () => { throw new HttpError(403, 'This place may not connect to that GitHub account. Nothing was changed.') })
    expect((await checkConnect(ask, deps)).problem?.kind).toBe('account_not_allowed')
  })
})

describe('checking an existing repository', () => {
  const existing = { ...ask, kind: 'existing' as const, repoUrl: 'https://github.com/acme/store' }

  it('chooses the account of the address\'s owner, and passes when the account reaches it', async () => {
    const res = await checkConnect(existing, deps)
    expect(deps.choose).toHaveBeenCalledWith(PLACE, { installationRowId: undefined, ownerLogin: 'acme' })
    expect(deps.mintForConnecting).toHaveBeenCalledWith(expect.objectContaining({ repositoryName: 'store', permissions: { contents: 'read' } }))
    expect(res.ok).toBe(true)
    expect(revoked).toEqual(['ghs_read'])
  })

  it('says so when the account does not reach it', async () => {
    deps.mintForConnecting = vi.fn(async () => { throw new HttpError(404, 'not found') })
    const res = await checkConnect(existing, deps)
    expect(res.problem?.kind).toBe('not_found')
    expect(res.problem?.words).toMatch(/Nothing was changed\.$/)
  })

  it('refuses an address that is not GitHub\'s', async () => {
    expect((await checkConnect({ ...existing, repoUrl: 'https://evil.example/acme/store' }, deps)).problem?.kind).toBe('bad_name')
  })
})

describe('undoing a repository that was created', () => {
  let nd: NewRepositoryDeps
  beforeEach(() => {
    nd = {
      mintForCreating: vi.fn(async () => ({ token: 'ghs_admin', installation: inst() as never })),
      create: vi.fn(), remove: vi.fn(async () => true), revoke: vi.fn(async () => true), record: vi.fn(async () => undefined),
    }
  })
  const account = { place: PLACE, person: 'u1', installationRowId: 'row1', login: 'acme' }

  it('deletes it and says so', async () => {
    const said = await undoCreatedRepository(account, 'web', nd)
    expect(nd.remove).toHaveBeenCalledWith('ghs_admin', 'acme', 'web')
    expect(said).toMatch(/acme\/web.*was deleted again/)
    expect(nd.revoke).toHaveBeenCalledWith('ghs_admin')
    expect(nd.record).not.toHaveBeenCalled()
  })

  it('records it and names it when it can\'t be deleted', async () => {
    nd.remove = vi.fn(async () => false)
    const said = await undoCreatedRepository(account, 'web', nd)
    expect(said).toMatch(/acme\/web.*could not be deleted.*still on GitHub/)
    expect(nd.record).toHaveBeenCalledWith(expect.objectContaining({ origin: 'github', subject: 'acme/web' }))
  })

  it('names it even when no token could be minted to delete it', async () => {
    nd.mintForCreating = vi.fn(async () => { throw new Error('the account is no longer allowed') })
    const said = await undoCreatedRepository(account, 'web', nd)
    expect(said).toMatch(/acme\/web.*the account is no longer allowed.*still on GitHub/)
    expect(nd.record).toHaveBeenCalled()
  })
})
