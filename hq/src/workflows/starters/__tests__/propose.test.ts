import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ versions: vi.fn(), secretNames: vi.fn() }))
vi.mock('wasp/server', () => ({
  prisma: { workflowVersion: { findMany: h.versions } },
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../../placeNames', () => ({ listPlaceSecretNames: h.secretNames }))
vi.mock('../../propose', () => ({ storeVersion: vi.fn() }))
vi.mock('../../executorImage', () => ({ executorImageForSite: vi.fn() }))
vi.mock('../../../storage/storageSite', () => ({ resolveStorageSite: vi.fn() }))

import { HttpError } from 'wasp/server'
import { proposeGitHubSecretName, proposeStarters, type StarterDeps } from '../propose'

const PLACE = { type: 'project' as const, id: 'p1' }
const WORKSPACE = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const DIGEST = `sha256:${'2'.repeat(64)}`

let deps: StarterDeps & { store: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  deps = { digestFor: vi.fn(async () => DIGEST), store: vi.fn(async () => ({ workflow: 'x', version: ++n, hash: 'h', flags: [], waitsForPerson: true as const })) }
  h.versions.mockResolvedValue([])
  h.secretNames.mockResolvedValue(['DEPLOY_KEY', 'NPM_TOKEN', 'GITHUB_APP_KEY'])
})

describe('proposing the starter workflows when a repository is connected', () => {
  it('proposes push, pull and open-pull-request as starters, on the site\'s executor image', async () => {
    const out = await proposeStarters(PLACE, WORKSPACE, deps)
    expect(out.map((o) => [o.workflow, o.proposed])).toEqual([['push', true], ['pull', true], ['open-pull-request', true]])
    for (const [place, proposal, proposer] of deps.store.mock.calls) {
      expect(place).toEqual(PLACE)
      expect(proposer).toEqual({ kind: 'starter' })
      expect(proposal.content.executorImageDigest).toBe(DIGEST)
    }
  })

  it('takes one already approved as already there, and carries on', async () => {
    deps.store.mockRejectedValueOnce(new HttpError(409, 'This is version 1 of push, which is already approved and can be run. Nothing was changed.'))
    const out = await proposeStarters(PLACE, WORKSPACE, deps)
    expect(out[0]).toMatchObject({ workflow: 'push', proposed: false })
    expect(out.slice(1).every((o) => o.proposed)).toBe(true)
  })

  it('refuses a workspace of another place', async () => {
    await expect(proposeStarters(PLACE, { ...WORKSPACE, ownerId: 'p2' }, deps)).rejects.toMatchObject({ statusCode: 400 })
    expect(deps.store).not.toHaveBeenCalled()
  })
})

describe('Also set it on GitHub', () => {
  it('proposes set-github-secrets with the names approved, waiting and new, leaving out ones the place no longer has', async () => {
    h.versions.mockResolvedValue([
      { state: 'PROPOSED', githubSecretNames: ['NPM_TOKEN'] },
      { state: 'APPROVED', githubSecretNames: ['DEPLOY_KEY', 'GONE_KEY'] },
    ])
    h.secretNames.mockResolvedValue(['DEPLOY_KEY', 'NPM_TOKEN', 'SENTRY_DSN'])
    await proposeGitHubSecretName(PLACE, 'SENTRY_DSN', deps)
    const proposal = deps.store.mock.calls[0][1]
    expect(proposal.content.githubSecretNames).toEqual(['DEPLOY_KEY', 'NPM_TOKEN', 'SENTRY_DSN'])
    expect(proposal.content.definition.steps.map((s: { name: string }) => s.name)).toEqual(['Set DEPLOY_KEY', 'Set NPM_TOKEN', 'Set SENTRY_DSN'])
  })

  it('refuses a name GitHub won\'t take, or one the place does not have', async () => {
    await expect(proposeGitHubSecretName(PLACE, 'GITHUB_APP_KEY', deps)).rejects.toMatchObject({ statusCode: 400 })
    await expect(proposeGitHubSecretName(PLACE, 'MISSING', deps)).rejects.toMatchObject({ statusCode: 404 })
    await expect(proposeGitHubSecretName(PLACE, 'GITHUB_TOKEN', deps)).rejects.toMatchObject({ statusCode: 400 })
    expect(deps.store).not.toHaveBeenCalled()
  })
})
