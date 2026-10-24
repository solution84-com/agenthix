/**
 * The mint gate's refusals and its token (workflows spec part 4, *The mint gate*; security A17). GitHub and the site
 * are stand-ins; every token is a dummy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({
  prisma: {},
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../../storage/workspaceStore', () => ({ getRepoForTarget: vi.fn() }))
vi.mock('../../workflows/placeAccess', () => ({ placeStanding: vi.fn() }))
vi.mock('../githubApp', () => ({ getAppJwt: vi.fn() }))

import type { RepoAttachmentRow } from '@agenthix/core'
import { mintForLocation, requirePermissions, type GateDeps } from '../mintGate'
import type { RuledInstallation } from '../connectRule'
import type { InstallationToken, TokenAsk } from '../installationTokens'

const PLACE = { type: 'project' as const, id: 'proj-a' }

const row = (over: Partial<RepoAttachmentRow> = {}): RepoAttachmentRow => ({
  id: 'att-1', ownerType: 'project', ownerId: 'proj-a', workspaceId: 'ws-1', repoUrl: 'https://github.com/acme-tests/trial-site',
  createdAt: '2026-10-24T00:00:00Z', installationId: 101, repositoryId: 5001, accountId: 77, accountLogin: 'acme-tests', ...over,
})

const installation = (over: Partial<RuledInstallation['rule']> = {}, accountId: number | null = 77): RuledInstallation => ({
  id: 'inst-row-1', installationId: 101, accountId, accountLogin: 'acme-tests', accountType: 'Organization', repositorySelection: 'all',
  rule: { state: 'ALLOWED', projectRule: 'CHOSEN_PROJECTS', projectIds: ['proj-a'], userIds: [], ...over },
})

let asks: TokenAsk[]
let revoked: string[]
let deps: GateDeps
let minted = 0

function tokenFor(ask: TokenAsk): InstallationToken {
  minted += 1
  return {
    token: `ghs_dummy_${minted}`, expiresAt: new Date(Date.now() + 3600_000), permissions: ask.permissions,
    repositories: (ask.repositoryIds ?? []).map((id) => ({ id, name: 'trial-site', fullName: 'acme-tests/trial-site', ownerId: 77, ownerLogin: 'acme-tests' })),
  }
}

beforeEach(() => {
  asks = []
  revoked = []
  deps = {
    attachment: vi.fn(async () => row()),
    installation: vi.fn(async () => installation()),
    personalProject: vi.fn(async () => null),
    standing: vi.fn(async () => 'works' as const),
    request: vi.fn(async (ask: TokenAsk) => { asks.push(ask); return tokenFor(ask) }),
    revoke: vi.fn(async (t: string) => { revoked.push(t); return true }),
  }
})

const ask = (over: Partial<Parameters<typeof mintForLocation>[0]> = {}) => ({
  place: PLACE, siteId: 'site-1', workspaceId: 'ws-1' as string | null, person: 'u1', needs: 'work' as const,
  permissions: { contents: 'write' as const }, ...over,
})

describe('the mint gate refuses @A17', () => {
  it.each([
    ['no permissions', {}],
    ['a null set', null],
    ['an unknown permission', { everything: 'write' }],
    ['an unknown level', { contents: 'admin' }],
    ['metadata to write', { metadata: 'write' }],
  ])('a mint with %s, never defaulting one', async (_what, permissions) => {
    await expect(mintForLocation(ask({ permissions: permissions as never }), deps)).rejects.toMatchObject({ statusCode: 400 })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it('another place\'s workspace: the row the site answers belongs elsewhere', async () => {
    vi.mocked(deps.attachment).mockResolvedValue(row({ ownerId: 'proj-b' }))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/another place.*Nothing was changed\.$/) })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it('another workspace of the place than the one asked for', async () => {
    vi.mocked(deps.attachment).mockResolvedValue(row({ workspaceId: 'ws-2' }))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('a location with no connection', async () => {
    vi.mocked(deps.attachment).mockResolvedValue(null)
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it.each(['installationId', 'repositoryId', 'accountId'] as const)('a connection without GitHub\'s %s (no backfill)', async (field) => {
    vi.mocked(deps.attachment).mockResolvedValue(row({ [field]: null }))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ids/) })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it('a connection from before the ids were a field at all', async () => {
    const { installationId: _i, repositoryId: _r, accountId: _a, accountLogin: _l, ...old } = row()
    vi.mocked(deps.attachment).mockResolvedValue(old)
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 409 })
  })

  it.each(['WANTS_TO_CONNECT', 'IGNORED'] as const)('an installation that is %s, not allowed', async (state) => {
    vi.mocked(deps.installation).mockResolvedValue(installation({ state }))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/allows it/) })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it('an installation HQ no longer knows', async () => {
    vi.mocked(deps.installation).mockResolvedValue(null)
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('a place the connect rule no longer includes, at this mint', async () => {
    await expect(mintForLocation(ask(), deps)).resolves.toBeTruthy()
    vi.mocked(deps.installation).mockResolvedValue(installation({ projectIds: [] }))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/may not connect/) })
    expect(asks).toHaveLength(1)
  })

  it('a person\'s own storage under every project, which never includes it', async () => {
    const own = { type: 'user' as const, id: 'u1' }
    vi.mocked(deps.attachment).mockResolvedValue(row({ ownerType: 'user', ownerId: 'u1' }))
    vi.mocked(deps.installation).mockResolvedValue(installation({ projectRule: 'EVERY_PROJECT', projectIds: [] }))
    await expect(mintForLocation(ask({ place: own }), deps)).rejects.toMatchObject({ statusCode: 403 })
    vi.mocked(deps.installation).mockResolvedValue(installation({ projectRule: 'EVERY_PROJECT', userIds: ['u1'] }))
    await expect(mintForLocation(ask({ place: own }), deps)).resolves.toBeTruthy()
  })

  it('an account matched by login but not by id', async () => {
    vi.mocked(deps.installation).mockResolvedValue(installation({}, 78))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 409 })
    vi.mocked(deps.installation).mockResolvedValue(installation({}, null))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it('a person who can\'t work in the place, whoever\'s run it is', async () => {
    vi.mocked(deps.standing).mockResolvedValue('reads')
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 403 })
    vi.mocked(deps.standing).mockResolvedValue('none')
    await expect(mintForLocation(ask({ needs: 'read' }), deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(deps.request).not.toHaveBeenCalled()
  })

  it('GitHub\'s answer for another repository: the token is ended', async () => {
    vi.mocked(deps.request).mockImplementation(async (a) => ({
      ...tokenFor(a), repositories: [{ id: 6000, name: 'website', fullName: 'acme/website', ownerId: 12, ownerLogin: 'acme' }],
    }))
    await expect(mintForLocation(ask(), deps)).rejects.toMatchObject({ statusCode: 502 })
    expect(revoked).toHaveLength(1)
  })
})

describe('the token the gate mints', () => {
  it('is for the workspace\'s repository by id, with exactly the permissions asked for', async () => {
    const t = await mintForLocation(ask({ permissions: { contents: 'write', pull_requests: 'read' } }), deps)
    expect(asks).toEqual([{ installationId: 101, permissions: { contents: 'write', pull_requests: 'read' }, repositoryIds: [5001] }])
    expect(asks[0]).not.toHaveProperty('repositoryNames')
    expect(t.repository).toMatchObject({ id: 5001, fullName: 'acme-tests/trial-site' })
    expect(deps.attachment).toHaveBeenCalledWith('site-1', { ownerType: 'project', ownerId: 'proj-a', workspaceId: 'ws-1' })
  })

  it('asks for the owner\'s own files with no workspace id on the wire', async () => {
    vi.mocked(deps.attachment).mockResolvedValue(row({ workspaceId: null }))
    await mintForLocation(ask({ workspaceId: null }), deps)
    expect(deps.attachment).toHaveBeenCalledWith('site-1', { ownerType: 'project', ownerId: 'proj-a' })
  })

  it('is minted fresh every time, never cached', async () => {
    const a = await mintForLocation(ask(), deps)
    const b = await mintForLocation(ask(), deps)
    expect(a.token).not.toBe(b.token)
    expect(asks).toHaveLength(2)
  })
})

describe('requirePermissions', () => {
  it('keeps the set as given', () => {
    expect(requirePermissions({ contents: 'read', metadata: 'read' })).toEqual({ contents: 'read', metadata: 'read' })
  })
})
