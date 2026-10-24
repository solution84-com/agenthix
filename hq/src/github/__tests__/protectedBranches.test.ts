/**
 * Security A16 (workflows spec part 6): `push` and `open-pull-request` refuse a protected target branch, read from
 * GitHub when the run starts. A branch is protected when GitHub says so, when a ruleset applies to its name, or when
 * a classic protection rule's pattern matches it — a branch the push would create included. GitHub is a stand-in;
 * the token is a dummy, and it is ended after every read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../mintGate', () => ({ mintForLocation: vi.fn(), revokeGateToken: vi.fn() }))

import { matchesProtectionPattern, refuseProtectedBranch, PROTECTION_READ_PERMISSIONS, type LocationApiDeps } from '../protectedBranches'

const TOKEN = 'ghs_dummy_canary_protect'
const LOC = { place: { type: 'project' as const, id: 'p1' }, siteId: 's1', workspaceId: 'w1', person: 'u1' }

type Answer = { status: number; body?: unknown }
function github(answers: { branch: Answer; rules?: Answer; patterns?: string[] | Answer }) {
  const calls: string[] = []
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push(url)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    const a: Answer = url.includes('/rules/branches/') ? answers.rules ?? { status: 200, body: [] }
      : url.endsWith('/graphql') ? (Array.isArray(answers.patterns ?? [])
        ? { status: 200, body: { data: { repository: { branchProtectionRules: { nodes: ((answers.patterns as string[] | undefined) ?? []).map((pattern) => ({ pattern })), pageInfo: { hasNextPage: false } } } } } }
        : answers.patterns as Answer)
      : answers.branch
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status })
  })
  const deps: LocationApiDeps & { mint: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } = {
    mint: vi.fn(async () => ({ token: TOKEN, expiresAt: new Date(), installationId: 1, repository: { id: 9, name: 'site', fullName: 'acme/site', ownerId: 7, ownerLogin: 'acme' } })),
    revoke: vi.fn(async () => true),
    fetch,
  }
  return { deps, calls }
}

describe('a protected target branch is refused', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes an unprotected branch, reading it with only what it needs, and ends the token', async () => {
    const { deps, calls } = github({ branch: { status: 200, body: { protected: false } } })
    await expect(refuseProtectedBranch(LOC, 'push', 'feature/x', deps)).resolves.toBeUndefined()
    expect(deps.mint).toHaveBeenCalledWith({ ...LOC, needs: 'work', permissions: PROTECTION_READ_PERMISSIONS })
    expect(calls[0]).toBe('https://api.github.com/repos/acme/site/branches/feature%2Fx')
    expect(deps.revoke).toHaveBeenCalledWith(TOKEN)
  })

  it('refuses a branch GitHub marks protected, saying why and that nothing was changed', async () => {
    const { deps } = github({ branch: { status: 200, body: { protected: true } } })
    await expect(refuseProtectedBranch(LOC, 'push', 'main', deps)).rejects.toMatchObject({
      statusCode: 409, message: expect.stringMatching(/^main is a protected branch of acme\/site .*Nothing was changed\.$/),
    })
    expect(deps.revoke).toHaveBeenCalledWith(TOKEN)
  })

  it('refuses a branch a ruleset applies to', async () => {
    const { deps } = github({ branch: { status: 404 }, rules: { status: 200, body: [{ type: 'pull_request' }] } })
    await expect(refuseProtectedBranch(LOC, 'open-pull-request', 'release/1', deps)).rejects.toMatchObject({ message: expect.stringContaining('a ruleset applies to it') })
  })

  it('refuses a new branch that a wildcard protection rule would protect once pushed', async () => {
    const { deps } = github({ branch: { status: 404 }, patterns: ['main', 'release/*'] })
    await expect(refuseProtectedBranch(LOC, 'push', 'release/2.0', deps)).rejects.toMatchObject({ message: expect.stringContaining('release/*') })
  })

  it('refuses when it cannot tell: an unreadable answer is never taken as unprotected', async () => {
    for (const answers of [
      { branch: { status: 500 } },
      { branch: { status: 404 }, rules: { status: 403 } },
      { branch: { status: 404 }, rules: { status: 403, body: { message: 'Resource not accessible by integration' } } },
      { branch: { status: 404 }, patterns: { status: 200, body: { errors: [{ message: 'Resource not accessible by integration' }] } } },
      { branch: { status: 404 }, patterns: { status: 200, body: { data: { repository: { branchProtectionRules: { nodes: [], pageInfo: { hasNextPage: true } } } } } } },
    ]) {
      const { deps } = github(answers)
      await expect(refuseProtectedBranch(LOC, 'push', 'feature/x', deps)).rejects.toMatchObject({ statusCode: 502 })
      expect(deps.revoke).toHaveBeenCalled()
    }
  })

  it('reads a plan without rulesets as none applying, and still checks the protection rules', async () => {
    const noRulesets = { status: 403, body: { message: 'Upgrade to GitHub Pro or make this repository public to enable this feature.' } }
    await expect(refuseProtectedBranch(LOC, 'push', 'demo-1', github({ branch: { status: 404 }, rules: noRulesets }).deps)).resolves.toBeUndefined()
    const { deps } = github({ branch: { status: 404 }, rules: noRulesets, patterns: ['demo-*'] })
    await expect(refuseProtectedBranch(LOC, 'push', 'demo-1', deps)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('names the App\'s access only when GitHub refused the read, and the step that failed', async () => {
    const denied = github({ branch: { status: 404 }, rules: { status: 403, body: { message: 'Resource not accessible by integration' } } })
    await expect(refuseProtectedBranch(LOC, 'push', 'x', denied.deps)).rejects.toMatchObject({ message: expect.stringMatching(/\(its rulesets: 403\).*Administration: read/) })
    const down = github({ branch: { status: 502 } })
    await expect(refuseProtectedBranch(LOC, 'push', 'x', down.deps)).rejects.toMatchObject({ message: expect.not.stringContaining('Administration') })
  })
})

describe('protection patterns, read widely', () => {
  it.each([
    ['main', 'main', true],
    ['main', 'mainline', false],
    ['release/*', 'release/1', true],
    ['release/*', 'release/a/b', true],
    ['*', 'anything/at/all', true],
    ['v?.x', 'v1.x', true],
    ['[ab]*', 'beta', true],
    ['[!ab]*', 'beta', false],
    ['feat.x', 'featYx', false],
  ])('%s against %s is %s', (pattern, name, expected) => {
    expect(matchesProtectionPattern(pattern, name)).toBe(expected)
  })
})
