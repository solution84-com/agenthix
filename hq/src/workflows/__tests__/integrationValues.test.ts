/**
 * `GITHUB_TOKEN` for a run (workflows spec part 4, *The mint gate*; security A12, A17): minted through the gate for
 * the run's own row, stored encrypted, ended when it can't be kept, and revoked where it was issued. The gate and
 * GitHub are stand-ins; every value is a dummy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findRun: vi.fn(),
  createToken: vi.fn(),
}))
vi.mock('wasp/server', () => ({
  prisma: { workflowRun: { findUnique: h.findRun }, workflowMintedToken: { create: h.createToken } },
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../../github/mintGate', () => ({ mintForLocation: vi.fn(), revokeGateToken: vi.fn() }))

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import type { WorkflowDefinition } from '@agenthix/core'
import { decryptBytesBound } from '../../server/crypto/secretCrypto'
import { mintIntegrationValues, mintedTokenAssociatedData, revokeAtIssuer, type IntegrationDeps } from '../integrationValues'

const PLACE = { type: 'project' as const, id: 'proj-a' }
const TOKEN = 'ghs_dummy_canary_0a1b2c3d4e5f'

const definition = (secrets: string[], github: WorkflowDefinition['github'] = { contents: 'write' }) =>
  ({ name: 'push', description: '', steps: [{ name: 'Push', run: 'push-bundle', secrets }], variables: [], parameters: [], hosts: [], github } as unknown as WorkflowDefinition)

let deps: IntegrationDeps & { mintGitHub: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.clearAllMocks()
  h.findRun.mockResolvedValue({ placeType: 'project', placeId: 'proj-a', workspaceId: 'ws-1', siteId: 'site-1', onBehalfOfUserId: 'u1', agentId: 'kernel' })
  h.createToken.mockResolvedValue({})
  deps = {
    mintGitHub: vi.fn(async () => ({
      token: TOKEN, expiresAt: new Date('2026-10-24T12:00:00Z'), installationId: 101,
      repository: { id: 5001, name: 'trial-site', fullName: 'acme-tests/trial-site', ownerId: 77, ownerLogin: 'acme-tests' },
    })),
    revoke: vi.fn(async () => true),
  }
})

describe('GITHUB_TOKEN for a run', () => {
  it('mints nothing when no step names it', async () => {
    expect(await mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['KEY'], {}) }, deps)).toEqual({ values: [], github: null })
    expect(deps.mintGitHub).not.toHaveBeenCalled()
  })

  it('asks the gate for the run\'s own workspace, site and person, with the version\'s declared permissions — an agent\'s run, the built-in one included, no differently', async () => {
    await mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['GITHUB_TOKEN'], { contents: 'write' }) }, deps)
    expect(deps.mintGitHub).toHaveBeenCalledWith({
      place: PLACE, siteId: 'site-1', workspaceId: 'ws-1', person: 'u1', needs: 'work', permissions: { contents: 'write' },
    })
    expect(Object.keys(deps.mintGitHub.mock.calls[0][0])).not.toContain('agentId')
  })

  it('passes the gate\'s refusal on, storing nothing', async () => {
    deps.mintGitHub.mockRejectedValue(Object.assign(new Error('This place may not connect. Nothing was changed.'), { statusCode: 403 }))
    await expect(mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['GITHUB_TOKEN']) }, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(h.createToken).not.toHaveBeenCalled()
  })

  it('refuses a run recorded in another place, minting nothing', async () => {
    h.findRun.mockResolvedValue({ placeType: 'project', placeId: 'proj-b', workspaceId: 'ws-1', siteId: 'site-1', onBehalfOfUserId: 'u1' })
    await expect(mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['GITHUB_TOKEN']) }, deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(deps.mintGitHub).not.toHaveBeenCalled()
  })

  it('stores the token encrypted, bound to its row and place, and gives the site the address GitHub answered for the id', async () => {
    const minted = await mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['GITHUB_TOKEN']) }, deps)
    expect(minted.github).toEqual({ repository: 'acme-tests/trial-site', repositoryId: 5001, cloneUrl: 'https://github.com/acme-tests/trial-site.git' })
    expect(minted.values.map((v) => [v.name, v.value.toString()])).toEqual([['GITHUB_TOKEN', TOKEN]])
    const { data } = h.createToken.mock.calls[0][0]
    expect(data).toMatchObject({ runId: 'r1', placeType: 'project', placeId: 'proj-a', name: 'GITHUB_TOKEN' })
    expect(Buffer.from(data.ciphertext).includes(Buffer.from(TOKEN))).toBe(false)
    expect(decryptBytesBound(data.ciphertext, mintedTokenAssociatedData(data.id, PLACE)).toString()).toBe(TOKEN)
  })

  it('ends the token when it can\'t be stored', async () => {
    h.createToken.mockRejectedValue(new Error('database down'))
    await expect(mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['GITHUB_TOKEN']) }, deps)).rejects.toThrow('database down')
    expect(deps.revoke).toHaveBeenCalledWith(TOKEN)
  })

  it('ends a token for a repository whose answered name it would not use as an address', async () => {
    deps.mintGitHub.mockResolvedValue({ token: TOKEN, expiresAt: new Date(), installationId: 1, repository: { id: 1, name: 'x', fullName: 'evil.example/../x y', ownerId: 1, ownerLogin: 'a' } })
    await expect(mintIntegrationValues({ runId: 'r1', place: PLACE, definition: definition(['GITHUB_TOKEN']) }, deps)).rejects.toThrow()
    expect(deps.revoke).toHaveBeenCalledWith(TOKEN)
    expect(h.createToken).not.toHaveBeenCalled()
  })
})

describe('revoking where it was issued', () => {
  it('ends a GITHUB_TOKEN at GitHub, and answers whether GitHub has it ended', async () => {
    expect(await revokeAtIssuer('GITHUB_TOKEN', Buffer.from(TOKEN), deps)).toBe(true)
    expect(deps.revoke).toHaveBeenCalledWith(TOKEN)
    deps.revoke.mockResolvedValue(false)
    expect(await revokeAtIssuer('GITHUB_TOKEN', Buffer.from(TOKEN), deps)).toBe(false)
  })

  it('knows no other issuer', async () => {
    expect(await revokeAtIssuer('OTHER', Buffer.from('x'), deps)).toBe(false)
    expect(deps.revoke).not.toHaveBeenCalled()
  })
})
