/**
 * Answering an agent's asset request (D31): only the person it acts for, Approve only by their tap, the right checked
 * again when approved, and the agent recorded as who asked. The person's rows are stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OperationEnd } from '../../../conversations/contract'
import type { PersonActor } from '../../policy'

const people = vi.hoisted(() => ({ actor: null as PersonActor | null, outsideInstallers: 'ADMINS' as 'ADMINS' | 'ADMINS_AND_MAINTAINERS' }))
vi.mock('../../policyActors', () => ({
  personActor: async (userId: string) => ({ ...people.actor!, userId }),
  organisationTarget: async () => ({ level: 'organisation', outsideInstallers: people.outsideInstallers }),
}))

import { answerAssetCard, assetAnswerRefusal, APPROVE_ASSET_BY_TAP } from '../answer'
import type { ApprovedRequest, AssetRequestHandlers } from '../handlers'
import type { AssetRequestArgs } from '../types'

const ADMIN: PersonActor = { kind: 'person', userId: 'u1', role: 'ADMIN', libraryMaintainer: false, projectRole: null }
const MEMBER: PersonActor = { ...ADMIN, role: 'MEMBER' }

const publishArgs: AssetRequestArgs = {
  request: { kind: 'publish', assetId: 'a1', revision: 2, note: 'Clearer steps' },
  requester: { agentId: 'agent-1', runId: 'run-1', forUserId: 'u1' },
  target: { level: 'organisation' },
  action: 'publish',
}

let state: string
let ends: OperationEnd[]
let calls: { kind: string; approved: ApprovedRequest }[]
let handlers: AssetRequestHandlers
const deps = () => ({
  async start() {
    if (state !== 'WAITING_FOR_APPROVAL') return false
    state = 'RUNNING'
    return true
  },
  async settle(_id: string, end: OperationEnd) {
    ends.push(end)
    state = end.state
    return true
  },
  handlers,
})
const row = (args: AssetRequestArgs = publishArgs) => ({ id: 'op-1', args: args as unknown as Record<string, unknown> })

beforeEach(() => {
  state = 'WAITING_FOR_APPROVAL'
  ends = []
  calls = []
  people.actor = ADMIN
  people.outsideInstallers = 'ADMINS'
  const record = (kind: string) => async (_r: unknown, approved: ApprovedRequest) => {
    calls.push({ kind, approved })
    return `Did ${kind}.`
  }
  handlers = { publish: record('publish'), rollBack: record('rollBack'), switchOn: record('switchOn'), install: record('install') }
})

describe('who may answer an asset request @SC-1664', () => {
  it('is only the person it acts for, and Approve only by their tap', () => {
    expect(assetAnswerRefusal({ authorisedById: 'u1' }, 'approve', 'u1', 'card')).toBeNull()
    expect(assetAnswerRefusal({ authorisedById: 'u1' }, 'decline', 'u1', 'turn')).toBeNull()
    expect(assetAnswerRefusal({ authorisedById: 'u1' }, 'approve', 'u1', 'turn')).toBe(APPROVE_ASSET_BY_TAP)
    expect(assetAnswerRefusal({ authorisedById: 'u1' }, 'approve', 'admin-2', 'card')).toContain('Only the person the agent asked')
  })
})

describe('answering an asset request @SC-1664', () => {
  it('runs it when approved, as that person, recording the agent as who asked', async () => {
    await answerAssetCard(row(), 'approve', 'u1', deps())
    expect(calls).toEqual([{ kind: 'publish', approved: { actor: { ...ADMIN, userId: 'u1' }, requestedByAgentId: 'agent-1', runId: 'run-1' } }])
    expect(ends).toEqual([{ state: 'COMPLETED', result: { summary: 'Did publish.' } }])
  })

  it('does nothing when declined', async () => {
    await answerAssetCard(row(), 'decline', 'u1', deps())
    expect(calls).toEqual([])
    expect(ends).toMatchObject([{ state: 'CANCELLED', noReport: true }])
  })

  it('checks the right again when approved, and does nothing if the person no longer holds it', async () => {
    people.actor = MEMBER
    await expect(answerAssetCard(row(), 'approve', 'u1', deps())).rejects.toMatchObject({ statusCode: 403 })
    expect(calls).toEqual([])
    expect(ends).toMatchObject([{ state: 'FAILED', error: expect.stringContaining('administrators and Library maintainers') }])
  })

  it('reads P3 as it is now for a link install', async () => {
    people.actor = { ...MEMBER, libraryMaintainer: true }
    const args: AssetRequestArgs = { ...publishArgs, request: { kind: 'install', from: 'url', link: 'https://example.com/p.zip' }, action: 'installFromOutside' }
    await expect(answerAssetCard(row(args), 'approve', 'u1', deps())).rejects.toMatchObject({ statusCode: 403 })
    state = 'WAITING_FOR_APPROVAL'
    people.outsideInstallers = 'ADMINS_AND_MAINTAINERS'
    await answerAssetCard(row(args), 'approve', 'u1', deps())
    expect(calls.map(c => c.kind)).toEqual(['install'])
  })

  it('refuses anyone but the person it acts for, and a second answer', async () => {
    await expect(answerAssetCard(row(), 'approve', 'someone-else', deps())).rejects.toMatchObject({ statusCode: 403 })
    await answerAssetCard(row(), 'approve', 'u1', deps())
    await expect(answerAssetCard(row(), 'approve', 'u1', deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(calls).toHaveLength(1)
  })

  it('ends failed with the refusal\'s words when what it asks can no longer be done', async () => {
    handlers.publish = async () => { throw Object.assign(new (await import('wasp/server')).HttpError(409, 'The draft changed since. Nothing was changed.')) }
    await expect(answerAssetCard(row(), 'approve', 'u1', deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(ends).toEqual([{ state: 'FAILED', error: 'The draft changed since. Nothing was changed.' }])
  })

  it('ends failed with the lifecycle\'s own words and status when the draft moved or the version can\'t be reached', async () => {
    const { LifecycleError } = await import('../../lifecycle/errors')
    handlers.publish = async () => { throw new LifecycleError('The draft changed as you published it. Look at the changes again. Nothing was changed.', 409) }
    await expect(answerAssetCard(row(), 'approve', 'u1', deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(ends).toEqual([{ state: 'FAILED', error: 'The draft changed as you published it. Look at the changes again. Nothing was changed.' }])
  })

  it('holds nothing to do when its arguments are not an asset request', async () => {
    await expect(answerAssetCard({ id: 'op-1', args: { taskId: 't1' } }, 'approve', 'u1', deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(state).toBe('WAITING_FOR_APPROVAL')
  })
})
