/**
 * A version's life under races (workflows spec part 1, *A version's life*): a newer proposal replaces the ones
 * waiting, a review that finishes late writes no card, an image upgrade is carried only from a still-approved
 * version, and a failure closing cards never turns a made decision into an error.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  tx: {
    workflow: { upsert: vi.fn(), update: vi.fn() },
    workflowVersion: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn(),
    },
    workflowApproval: { create: vi.fn() },
  },
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('wasp/server', () => ({
  HttpError: class extends Error {},
  prisma: {
    $transaction: (fn: (tx: typeof db.tx) => unknown) => fn(db.tx),
    workflowVersion: { findUnique: db.findUnique, findFirst: db.findFirst, update: vi.fn() },
    agent: { findUnique: vi.fn() },
  },
}))
vi.mock('@agenthix/core', async (orig) => ({ ...(await orig<object>()), hashWorkflowVersion: async () => 'h2' }))
vi.mock('../checks/ceiling', () => ({ githubCeilingFor: async () => ({}) }))
vi.mock('../checks', () => ({ runPlainChecks: () => ({ flags: [], summary: '', card: { mayApprove: true } }) }))
const closeCards = vi.hoisted(() => vi.fn())
vi.mock('../closeCards', () => ({ closeCardsOf: closeCards }))
vi.mock('../review/reviewer', () => ({
  askReviewer: async () => ({ level: 'LOW', review: { points: [] } }),
  organisationReviewModel: vi.fn(),
}))

import { storeVersion } from '../propose'
import { upgradeApprovedVersion } from '../imageUpgrade'
import { reviewAndPresent } from '../review/afterProposal'

beforeEach(() => {
  vi.clearAllMocks()
  db.findUnique.mockReset()
  db.findFirst.mockReset()
})

describe('a newer proposal', () => {
  it('supersedes the versions still waiting and closes their cards', async () => {
    const t = db.tx
    t.workflow.upsert.mockResolvedValue({ id: 'w1' })
    t.workflowVersion.findUnique.mockResolvedValue(null)
    t.workflowVersion.findFirst.mockResolvedValue(null)
    t.workflowVersion.aggregate.mockResolvedValue({ _max: { number: 3 } })
    t.workflowVersion.create.mockResolvedValue({ id: 'v4' })
    t.workflowVersion.findMany.mockResolvedValue([{ id: 'v2' }, { id: 'v3' }])
    const follow = vi.fn()
    const proposal = {
      hash: 'h', content: { definition: { name: 'deploy' }, files: [], githubSecretNames: [], executorImageDigest: 'sha256:x' },
    }
    const result = await storeVersion({ type: 'project', id: 'p1' }, proposal as never, { kind: 'starter' }, follow)
    expect(result.version).toBe(4)
    expect(t.workflowVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workflowId: 'w1', state: 'PROPOSED', id: { not: 'v4' } },
    }))
    expect(t.workflowVersion.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['v2', 'v3'] } }, data: { state: 'SUPERSEDED' } })
    expect(closeCards).toHaveBeenCalledWith(['v2', 'v3'])
    expect(follow).toHaveBeenCalledWith('v4')
  })
})

describe('a review that finishes late', () => {
  it('writes no card when the version was decided meanwhile', async () => {
    db.findUnique
      .mockResolvedValueOnce({
        id: 'v2', state: 'PROPOSED', workflowId: 'w1', number: 2, hash: 'h', checkFlags: [], files: [], proposedByAgentId: null, executorImageDigest: 'sha256:a', definition: { name: 'deploy', steps: [], hosts: [], github: {}, parameters: [] }, githubSecretNames: [],
        workflow: { name: 'deploy', placeType: 'project', placeId: 'p1' },
      })
      .mockResolvedValueOnce({ state: 'DECLINED' })
    db.findFirst.mockResolvedValue(null)
    const writeCard = vi.fn()
    await reviewAndPresent('v2', { model: vi.fn(), writeCard })
    expect(writeCard).not.toHaveBeenCalled()
  })
})

describe('carrying an approved version to a new image', () => {
  const A = `sha256:${'a'.repeat(64)}`
  const B = `sha256:${'b'.repeat(64)}`
  const image = (digest: string) => ({ digest, release: null, toolsKey: null })

  it('does nothing when the version is no longer the approved one', async () => {
    db.findUnique.mockResolvedValue({
      id: 'v1', state: 'APPROVED', workflowId: 'w1', executorImageDigest: A, definition: { name: 'x' }, files: [],
      githubSecretNames: [], workflow: { placeType: 'project', placeId: 'p1' },
    })
    db.tx.workflowVersion.findUnique.mockResolvedValue({ state: 'SUPERSEDED' })
    const outcome = await upgradeApprovedVersion('v1', image(A), image(B))
    expect(outcome).toEqual({ skipped: 'already_made' })
    expect(db.tx.workflowVersion.create).not.toHaveBeenCalled()
  })
})

describe('closing the cards of a decided version', () => {
  it('logs a failure and does not throw, since the decision is already made', async () => {
    vi.doUnmock('../closeCards')
    vi.resetModules()
    vi.doMock('../review/cardAnswer', () => ({ closeWorkflowCards: async () => { throw new Error('store down') } }))
    vi.doMock('../../conversations/coordinator/mailbox', () => ({ settleOperation: vi.fn() }))
    const { closeCardsOf } = await import('../closeCards')
    await expect(closeCardsOf(['v1'])).resolves.toBeUndefined()
  })
})
