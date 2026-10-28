/**
 * Integration tests (ADR-0094, real test DB) for what an agent's request would change, on its approval card (spec part
 * 5, D31): read from HQ's records for the person the agent asked and no one else; a draft that moved since is said to
 * have. Not run by the lane that wrote it; the lead runs it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})

import { createAgent, createUserWithRole } from '../../../../test/factories'
import { sealJson, sealText } from '../../../../conversations/sealing'
import { storeContent } from '../../../content'
import { ASSET_REQUEST_TOOL, type AssetRequestArgs } from '../../../approvals/types'
import { assetRequestChange } from '../assetRequestChange'

const md = (body: string) => [{ path: 'SKILL.md', content: Buffer.from(`---\nname: code-review\ndescription: Reviews.\n---\n${body}`) }]

let person: { id: string }
let other: { id: string }
let agent: { id: string }
let assetId: string
let conversationId: string

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  person = await createUserWithRole('ADMIN')
  other = await createUserWithRole('ADMIN')
  agent = await createAgent({ name: 'Ada' })
  const v1 = await storeContent(md('Step one.\n'), prisma)
  const draft = await storeContent(md('Step one.\nStep two.\n'), prisma)
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'fernhill', name: 'code-review' } })
  assetId = asset.id
  const version = await prisma.assetVersion.create({ data: { assetId, version: '1.0.0', digest: v1, source: 'MADE_HERE' } })
  await prisma.asset.update({ where: { id: assetId }, data: { currentVersionId: version.id } })
  await prisma.draft.create({ data: { assetId, digest: draft, revision: 2 } })
  conversationId = (await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })).id
})

async function card(request: AssetRequestArgs['request']) {
  const args: AssetRequestArgs = { request, requester: { agentId: agent.id, runId: 'r1', forUserId: person.id }, target: { level: 'organisation' }, action: 'publish' }
  return prisma.operation.create({
    data: {
      conversationId, kind: 'TOOL', mode: 'BACKGROUND', toolName: ASSET_REQUEST_TOOL, idempotencyKey: `asset-request:${Math.random()}`,
      state: 'WAITING_FOR_APPROVAL', title: sealText('Publish'), args: sealJson(args), authorisedById: person.id,
    },
  })
}

describe('what a publish request would change @D31 @SC-1665', () => {
  it('shows the person the agent asked the files that change, the next version and the note', async () => {
    const op = await card({ kind: 'publish', assetId, revision: 2, note: 'Adds step two' })
    const change = await assetRequestChange(prisma, person.id, op.id)
    expect(change).toMatchObject({ kind: 'publish', identity: 'fernhill/code-review', requestedBy: 'Ada', from: '1.0.0', to: '1.1.0', note: 'Adds step two', stale: null })
    if (change.kind !== 'publish') throw new Error('expected a publish')
    expect(change.changes.map(c => [c.path, c.status])).toEqual([['SKILL.md', 'modified']])
  })

  it('shows no one else anything, and nothing for a card that is not an asset request', async () => {
    const op = await card({ kind: 'publish', assetId, revision: 2, note: 'x' })
    expect(await assetRequestChange(prisma, other.id, op.id)).toEqual({ kind: 'none' })
    const plain = await prisma.operation.update({ where: { id: op.id }, data: { toolName: 'run_command' } })
    expect(await assetRequestChange(prisma, person.id, plain.id)).toEqual({ kind: 'none' })
    expect(await assetRequestChange(prisma, person.id, 'missing')).toEqual({ kind: 'none' })
  })

  it('says so when the draft has moved since the request', async () => {
    const op = await card({ kind: 'publish', assetId, revision: 1, note: 'x' })
    const change = await assetRequestChange(prisma, person.id, op.id)
    expect(change).toMatchObject({ kind: 'publish', stale: expect.stringContaining('now revision 2') })
  })
})
