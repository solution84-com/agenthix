/**
 * What an approved asset request hands to the Library's lifecycle and the install pipeline (D31, H5): exactly the
 * revision or version the request named, as the approving person, with the agent that asked written in the same call.
 * The lifecycle and the pipeline are stood in for; their own tests cover what they do with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PersonActor } from '../../policy'

const fakes = vi.hoisted(() => ({
  publishDraft: vi.fn(),
  moveToVersion: vi.fn(),
  installPackage: vi.fn(),
  previewInstall: vi.fn(),
  shelfArrival: vi.fn(),
}))
vi.mock('../../lifecycle/publish', () => ({ publishDraft: fakes.publishDraft }))
vi.mock('../../lifecycle/pinnedVersions', () => ({ moveToVersion: fakes.moveToVersion }))
vi.mock('../../install/commit', () => ({ installPackage: fakes.installPackage }))
vi.mock('../../install/preview', () => ({ previewInstall: fakes.previewInstall }))
vi.mock('../../sources/imageShelf', () => ({ shelfArrival: fakes.shelfArrival }))
vi.mock('../../signing', () => ({ createVerifier: () => ({}) }))

import { assetRequestHandlers, type ApprovedRequest } from '../handlers'

const ADMIN: PersonActor = { kind: 'person', userId: 'u1', role: 'ADMIN', libraryMaintainer: false, projectRole: null }
const approved: ApprovedRequest = { actor: ADMIN, requestedByAgentId: 'agent-1', runId: 'run-1' }

beforeEach(() => {
  vi.clearAllMocks()
  fakes.publishDraft.mockResolvedValue({ identity: 'fernhill/code-review', version: '1.1.0', tookPlaceOf: null })
  fakes.moveToVersion.mockResolvedValue({ identity: 'fernhill/code-review', version: '1.0.0' })
  fakes.shelfArrival.mockResolvedValue({ source: 'image' })
  fakes.previewInstall.mockResolvedValue({ refusal: null, fingerprint: 'fp-1', needs: { unsignedRead: false, publisherChoice: false } })
  fakes.installPackage.mockResolvedValue({ assetId: 'a1', message: 'Installed.' })
})

describe('an approved publish @D31 @SC-1664', () => {
  it('publishes exactly the revision the request named, as the person, requested by the agent', async () => {
    const summary = await assetRequestHandlers.publish({ kind: 'publish', assetId: 'a1', revision: 3, note: 'Clearer steps', bump: 'patch' }, approved)
    expect(fakes.publishDraft).toHaveBeenCalledTimes(1)
    const [, actor, input] = fakes.publishDraft.mock.calls[0]
    expect(actor).toBe(ADMIN)
    expect(input).toEqual({ assetId: 'a1', revision: 3, note: 'Clearer steps', bump: 'patch', requestedByAgentId: 'agent-1' })
    expect(summary).toContain('fernhill/code-review 1.1.0')
  })

  it('passes the lifecycle\'s refusal on, so the card ends failed with its words', async () => {
    const refusal = Object.assign(new Error('The draft changed as you published it. Nothing was changed.'), { status: 409 })
    fakes.publishDraft.mockRejectedValue(refusal)
    await expect(assetRequestHandlers.publish({ kind: 'publish', assetId: 'a1', revision: 3, note: 'n' }, approved)).rejects.toBe(refusal)
  })
})

describe('an approved roll back @D31 @SC-1664', () => {
  it('rolls back to the version the request named, with its reason, as the person, requested by the agent', async () => {
    const summary = await assetRequestHandlers.rollBack({ kind: 'rollBack', assetId: 'a1', toVersionId: 'v1', reason: 'It broke reviews' }, approved)
    expect(fakes.moveToVersion).toHaveBeenCalledTimes(1)
    const [, actor, move, input] = fakes.moveToVersion.mock.calls[0]
    expect(actor).toBe(ADMIN)
    expect(move).toBe('rollBack')
    expect(input).toEqual({ assetId: 'a1', versionId: 'v1', reason: 'It broke reviews', requestedByAgentId: 'agent-1' })
    expect(summary).toContain('fernhill/code-review')
    expect(summary).toContain('1.0.0')
  })
})

describe('an approved install @D31 @SC-1664', () => {
  it('hands the agent that asked to the install itself, so it is written in the same transaction', async () => {
    await assetRequestHandlers.install({ kind: 'install', from: 'shelf', name: 'code-review', note: 'For reviews' }, approved)
    expect(fakes.installPackage).toHaveBeenCalledTimes(1)
    const [, confirmation, actor, , options] = fakes.installPackage.mock.calls[0]
    expect(confirmation).toEqual({ fingerprint: 'fp-1', note: 'For reviews' })
    expect(actor).toBe(ADMIN)
    expect(options).toEqual({ requestedByAgentId: 'agent-1' })
  })
})

describe('switching on @SC-1664', () => {
  it('is still refused when approved, with nothing done', async () => {
    await expect(assetRequestHandlers.switchOn({ kind: 'switchOn', placeSkillId: 'p1', fingerprint: 'f' }, approved))
      .rejects.toMatchObject({ statusCode: 409 })
  })
})
