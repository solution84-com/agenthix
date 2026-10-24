/**
 * Security A16 (workflows spec part 6): `set-github-secrets` sets secrets only on an environment whose deployment
 * branches are protected branches only (V7). HQ checks it when the run starts, creates it that way when it is new,
 * and refuses one that admits other branches rather than change the repository's own setting. GitHub is a stand-in.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../mintGate', () => ({ mintForLocation: vi.fn(), revokeGateToken: vi.fn() }))

import { ensureProtectedEnvironment, onlyProtectedBranches } from '../githubEnvironment'
import type { LocationApiDeps } from '../protectedBranches'

const LOC = { place: { type: 'project' as const, id: 'p1' }, siteId: 's1', workspaceId: 'w1', person: 'u1' }
const PROTECTED = { deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }

function github(get: { status: number; body?: unknown }, put: { status: number; body?: unknown } = { status: 200, body: PROTECTED }) {
  const requests: { url: string; method: string; body?: string }[] = []
  const deps: LocationApiDeps & { mint: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } = {
    mint: vi.fn(async () => ({ token: 'ghs_dummy_env', expiresAt: new Date(), installationId: 1, repository: { id: 9, name: 'site', fullName: 'acme/site', ownerId: 7, ownerLogin: 'acme' } })),
    revoke: vi.fn(async () => true),
    fetch: vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined })
      const a = (init.method ?? 'GET') === 'PUT' ? put : get
      return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status })
    }),
  }
  return { deps, requests }
}

describe('the environment set-github-secrets sets its secrets on', () => {
  it('is used as it is when it admits only protected branches, read with actions: read', async () => {
    const { deps, requests } = github({ status: 200, body: PROTECTED })
    expect(await ensureProtectedEnvironment(LOC, 'production', deps)).toBe('ready')
    expect(deps.mint).toHaveBeenCalledWith(expect.objectContaining({ permissions: { actions: 'read' } }))
    expect(requests.map((r) => r.method)).toEqual(['GET'])
  })

  it('is created with deployment branches limited to protected ones when it does not exist', async () => {
    const { deps, requests } = github({ status: 404 })
    expect(await ensureProtectedEnvironment(LOC, 'production', deps)).toBe('created')
    expect(deps.mint).toHaveBeenLastCalledWith(expect.objectContaining({ permissions: { administration: 'write' } }))
    expect(requests[1]).toMatchObject({ url: 'https://api.github.com/repos/acme/site/environments/production', method: 'PUT' })
    expect(JSON.parse(requests[1].body!)).toEqual(PROTECTED)
    expect(deps.revoke).toHaveBeenCalledTimes(2)
  })

  it('refuses one that lets every branch deploy, or chosen branches, and changes nothing', async () => {
    for (const body of [{ deployment_branch_policy: null }, { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }]) {
      const { deps, requests } = github({ status: 200, body })
      await expect(ensureProtectedEnvironment(LOC, 'production', deps)).rejects.toMatchObject({
        statusCode: 409, message: expect.stringMatching(/Protected branches only.*Nothing was changed\.$/),
      })
      expect(requests.every((r) => r.method === 'GET')).toBe(true)
    }
  })

  it('refuses when GitHub made it without the limit', async () => {
    const { deps } = github({ status: 404 }, { status: 200, body: { deployment_branch_policy: null } })
    await expect(ensureProtectedEnvironment(LOC, 'production', deps)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('reads the policy strictly', () => {
    expect(onlyProtectedBranches(PROTECTED)).toBe(true)
    expect(onlyProtectedBranches({ deployment_branch_policy: { protected_branches: true, custom_branch_policies: true } })).toBe(false)
    expect(onlyProtectedBranches({})).toBe(false)
  })
})
