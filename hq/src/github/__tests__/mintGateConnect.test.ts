/** The mint gate for a repository being connected: the account, the rule, the person, and GitHub's answer by id. */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({
  prisma: {},
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../../storage/workspaceStore', () => ({ getRepoForTarget: vi.fn() }))
vi.mock('../../workflows/placeAccess', () => ({ placeStanding: vi.fn() }))
vi.mock('../githubApp', () => ({ getAppJwt: vi.fn() }))

import { chooseConnectInstallation, mintForConnecting, mintForCreating, type ConnectDeps } from '../mintGateConnect'
import type { RuledInstallation } from '../connectRule'
import type { TokenAsk } from '../installationTokens'

const PLACE = { type: 'project' as const, id: 'p1' }
const inst = (id: string, login: string, accountId = 7): RuledInstallation => ({
  id, installationId: Number(id.replace(/\D/g, '')) || 1, accountId, accountLogin: login, accountType: 'Organization', repositorySelection: 'all',
  rule: { state: 'ALLOWED', projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [] },
})

let deps: ConnectDeps
let asks: TokenAsk[]

beforeEach(() => {
  asks = []
  deps = {
    attachment: vi.fn(),
    installation: vi.fn(async () => inst('i1', 'acme')),
    personalProject: vi.fn(async () => null),
    standing: vi.fn(async () => 'administers' as const),
    request: vi.fn(async (a: TokenAsk) => {
      asks.push(a)
      return { token: 'ghs_dummy', expiresAt: new Date(), permissions: a.permissions, repositories: (a.repositoryNames ?? []).map((n) => ({ id: 55, name: n, fullName: `acme/${n}`, ownerId: 7, ownerLogin: 'acme' })) }
    }),
    revoke: vi.fn(async () => true),
    candidates: vi.fn(async () => [inst('i1', 'acme'), inst('i2', 'acme-tests', 8)]),
    projectDefault: vi.fn(async () => null),
  }
})

describe('which account a connection uses @SC-1314', () => {
  it('the one chosen, only among those the place may connect to', async () => {
    expect((await chooseConnectInstallation(PLACE, { installationRowId: 'i2' }, deps)).id).toBe('i2')
    await expect(chooseConnectInstallation(PLACE, { installationRowId: 'i9' }, deps)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('for an existing repository, the account whose login is its owner', async () => {
    expect((await chooseConnectInstallation(PLACE, { ownerLogin: 'ACME-tests' }, deps)).id).toBe('i2')
    await expect(chooseConnectInstallation(PLACE, { ownerLogin: 'north-ltd' }, deps)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('the project\'s default, else the only one, else asks', async () => {
    vi.mocked(deps.projectDefault).mockResolvedValue('i2')
    expect((await chooseConnectInstallation(PLACE, {}, deps)).id).toBe('i2')
    vi.mocked(deps.projectDefault).mockResolvedValue(null)
    await expect(chooseConnectInstallation(PLACE, {}, deps)).rejects.toMatchObject({ statusCode: 409 })
    vi.mocked(deps.candidates).mockResolvedValue([inst('i1', 'acme')])
    expect((await chooseConnectInstallation(PLACE, {}, deps)).id).toBe('i1')
    vi.mocked(deps.candidates).mockResolvedValue([])
    await expect(chooseConnectInstallation(PLACE, {}, deps)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('minting while connecting @SC-1316', () => {
  it('scopes the token to the one repository, with the permissions named, and answers its ids', async () => {
    const t = await mintForConnecting({ place: PLACE, person: 'u1', installationRowId: 'i1', repositoryName: 'site', permissions: { contents: 'write' } }, deps)
    expect(asks).toEqual([{ installationId: 1, permissions: { contents: 'write' }, repositoryNames: ['site'] }])
    expect(t.repository).toMatchObject({ id: 55, ownerId: 7 })
  })

  it('refuses an installation not allowed, or a place outside its rule, before asking GitHub', async () => {
    vi.mocked(deps.installation).mockResolvedValue({ ...inst('i1', 'acme'), rule: { state: 'WANTS_TO_CONNECT', projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [] } })
    await expect(mintForConnecting({ place: PLACE, person: 'u1', installationRowId: 'i1', repositoryName: 'site', permissions: { contents: 'read' } }, deps)).rejects.toMatchObject({ statusCode: 403 })
    vi.mocked(deps.installation).mockResolvedValue({ ...inst('i1', 'acme'), rule: { state: 'ALLOWED', projectRule: 'CHOSEN_PROJECTS', projectIds: [], userIds: [] } })
    await expect(mintForConnecting({ place: PLACE, person: 'u1', installationRowId: 'i1', repositoryName: 'site', permissions: { contents: 'read' } }, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(asks).toHaveLength(0)
  })

  it('refuses a person who can\'t work in the place', async () => {
    vi.mocked(deps.standing).mockResolvedValue('reads')
    await expect(mintForConnecting({ place: PLACE, person: 'u1', installationRowId: 'i1', repositoryName: 'site', permissions: { contents: 'read' } }, deps)).rejects.toMatchObject({ statusCode: 403 })
    await expect(mintForCreating({ place: PLACE, person: 'u1', installationRowId: 'i1' }, deps)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('ends a token GitHub scoped to a repository of another account', async () => {
    vi.mocked(deps.request).mockResolvedValue({ token: 'ghs_dummy', expiresAt: new Date(), permissions: {}, repositories: [{ id: 1, name: 's', fullName: 'evil/s', ownerId: 99, ownerLogin: 'evil' }] })
    await expect(mintForConnecting({ place: PLACE, person: 'u1', installationRowId: 'i1', repositoryName: 's', permissions: { contents: 'read' } }, deps)).rejects.toMatchObject({ statusCode: 502 })
    expect(deps.revoke).toHaveBeenCalledWith('ghs_dummy')
  })

  it('creates with administration alone, named', async () => {
    await mintForCreating({ place: PLACE, person: 'u1', installationRowId: 'i1' }, deps)
    expect(asks).toEqual([{ installationId: 1, permissions: { administration: 'write' } }])
  })
})
