/**
 * Integration tests (ADR-0094, real test DB) for an agent's publish and roll back as approval cards (spec part 5, D31;
 * part 2 *Editing*; security review H5): the card waits for the person the run acts for, Bypassed or not; approving it
 * publishes exactly the draft revision it named, or rolls back to the version it named, recorded with the person as
 * who did it and the agent as who asked; a draft that moved since, or a person who lost the right, is refused and
 * nothing is done. And an install's "requested by" is written by the install itself, never taken from a client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import { prisma } from '../../../test/db'
import { createAgent } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../conversations/coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../../conversations/coordinator/mailbox', async () => {
  const { spyMailbox } = await import('../../../conversations/work/workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../../../conversations/work/settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import { requestAssetChange } from '../request'
import { answerRequest } from '../../../conversations/work/toolCalls/answer'
import { sealText } from '../../../conversations/sealing'
import { createSkillDraft, publishAssetDraft, saveAssetDraft } from '../../lifecycle/operations'
import { installAsset, previewAssetInstall } from '../../operations'
import { installPackage } from '../../install/commit'
import { previewInstall } from '../../install/preview'
import { personActor } from '../../policyActors'
import { createVerifier } from '../../signing'
import { uploadArrival } from '../../sources/upload'
import { contextWithRole, useTempRoots, type TempRoots } from '../../../agents/__tests__/definitionFixtures'

const RUN = 'site-run-1'
const md = (body: string) => `---\nname: release-notes\ndescription: "Writes release notes"\n---\n\n${body}\n`
const files = (body: string) => [{ path: 'SKILL.md', text: md(body) }]

let roots: TempRoots
let person: { id: string }
let ctx: unknown
let agent: { id: string }
let conversationId: string
const requester = () => ({ agentId: agent.id, runId: RUN, forUserId: person.id })

beforeEach(async () => {
  roots = await useTempRoots()
  await prisma.org.create({ data: { name: 'Fernhill' } })
  const admin = await contextWithRole('ADMIN')
  person = admin.user
  ctx = admin.ctx
  agent = await createAgent({ name: 'Kernel', approval: 'bypassed' })
  conversationId = (await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })).id
  await prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'w1', state: 'RUNNING',
      title: sealText('Tidy the Library'), authorisedById: person.id, runId: RUN,
    },
  })
})
afterEach(async () => { await roots.restore() })

const approve = (operationId: string) => answerRequest({
  conversationId, operationId, answer: 'approve', note: null, answererId: person.id, via: { kind: 'card', clientMessageId: `c-${operationId}` },
})
const stateOf = async (operationId: string) => (await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).state

/** release-notes 1.0.0 published by the person, and a draft at revision 1 on top of it. */
async function publishedWithDraft() {
  const { assetId } = await createSkillDraft({ name: 'release-notes', description: 'Writes release notes' }, ctx as never)
  await publishAssetDraft({ assetId, revision: 1, note: 'First' }, ctx as never)
  await saveAssetDraft({ assetId, files: files('Clearer steps'), revision: null }, ctx as never)
  return assetId
}

describe('an agent\'s publish @D31', () => {
  it('waits for the person as a card, though the agent is Bypassed, and publishes nothing yet', async () => {
    const assetId = await publishedWithDraft()
    const { operationId, waitsForPerson } = await requestAssetChange(requester(), { kind: 'publish', assetId, revision: 1, note: 'Clearer steps' })
    expect(waitsForPerson).toBe(true)
    expect(await stateOf(operationId)).toBe('WAITING_FOR_APPROVAL')
    expect(await prisma.assetVersion.count({ where: { assetId } })).toBe(1)
    expect(await prisma.draft.count({ where: { assetId } })).toBe(1)
  })

  it('publishes exactly the revision named when approved, recorded as the person\'s and requested by the agent', async () => {
    const assetId = await publishedWithDraft()
    const draft = await prisma.draft.findUniqueOrThrow({ where: { assetId } })
    const { operationId } = await requestAssetChange(requester(), { kind: 'publish', assetId, revision: 1, note: 'Clearer steps', bump: 'patch' })
    await approve(operationId)
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, include: { currentVersion: true, draft: true } })
    expect(asset.currentVersion).toMatchObject({ version: '1.0.1', digest: draft.digest, note: 'Clearer steps', byId: person.id, requestedByAgentId: agent.id })
    expect(asset.draft).toBeNull()
    const pin = await prisma.assetPinChange.findFirstOrThrow({ where: { assetId, toVersionId: asset.currentVersionId! } })
    expect(pin).toMatchObject({ byId: person.id, requestedByAgentId: agent.id })
    expect(await stateOf(operationId)).toBe('COMPLETED')
  })

  it('is refused on approval when the draft moved after the request, and nothing is published', async () => {
    const assetId = await publishedWithDraft()
    const { operationId } = await requestAssetChange(requester(), { kind: 'publish', assetId, revision: 1, note: 'Clearer steps' })
    await saveAssetDraft({ assetId, files: files('Something nobody approved'), revision: 1 }, ctx as never)
    await expect(approve(operationId)).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.assetVersion.count({ where: { assetId } })).toBe(1)
    expect(await prisma.draft.findUniqueOrThrow({ where: { assetId } })).toMatchObject({ revision: 2 })
    expect(await stateOf(operationId)).toBe('FAILED')
  })

  it('is refused on approval when the person no longer holds the right', async () => {
    const assetId = await publishedWithDraft()
    const { operationId } = await requestAssetChange(requester(), { kind: 'publish', assetId, revision: 1, note: 'Clearer steps' })
    await prisma.userSettings.update({ where: { userId: person.id }, data: { role: 'MEMBER' } })
    await expect(approve(operationId)).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.assetVersion.count({ where: { assetId } })).toBe(1)
    expect(await stateOf(operationId)).toBe('FAILED')
  })
})

describe('an agent\'s roll back @D31', () => {
  async function twoVersions() {
    const assetId = await publishedWithDraft()
    await publishAssetDraft({ assetId, revision: 1, note: 'Clearer steps' }, ctx as never)
    const first = await prisma.assetVersion.findFirstOrThrow({ where: { assetId, version: '1.0.0' } })
    return { assetId, first }
  }

  it('waits for the person, then rolls back to the version named, recorded as theirs and requested by the agent', async () => {
    const { assetId, first } = await twoVersions()
    const { operationId } = await requestAssetChange(requester(), { kind: 'rollBack', assetId, toVersionId: first.id, reason: 'It broke the notes' })
    expect(await stateOf(operationId)).toBe('WAITING_FOR_APPROVAL')
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).currentVersionId).not.toBe(first.id)
    await approve(operationId)
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).currentVersionId).toBe(first.id)
    const pin = await prisma.assetPinChange.findFirstOrThrow({ where: { assetId, toVersionId: first.id }, orderBy: { at: 'desc' } })
    expect(pin).toMatchObject({ byId: person.id, requestedByAgentId: agent.id, reason: 'It broke the notes' })
    expect(await stateOf(operationId)).toBe('COMPLETED')
  })

  it('is refused on approval when the person no longer holds the right', async () => {
    const { assetId, first } = await twoVersions()
    const { operationId } = await requestAssetChange(requester(), { kind: 'rollBack', assetId, toVersionId: first.id, reason: 'It broke the notes' })
    await prisma.userSettings.update({ where: { userId: person.id }, data: { role: 'MEMBER' } })
    await expect(approve(operationId)).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).currentVersionId).not.toBe(first.id)
    expect(await stateOf(operationId)).toBe('FAILED')
  })
})

describe('an install\'s "requested by"', () => {
  async function uploadArgs() {
    const z = new JSZip()
    z.file('code-review/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version: '1.0.0', description: 'Reviews', licence: 'MIT' }))
    z.file('code-review/SKILL.md', '---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n')
    return { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
  }

  it('is written by the install itself, on the version and the pin change', async () => {
    const args = await uploadArgs()
    const arrival = await uploadArrival({ zip: args.zip })
    const actor = await personActor(person.id, prisma)
    const deps = { db: prisma, verifier: createVerifier(), now: new Date() }
    const preview = await previewInstall(arrival, actor, deps)
    await installPackage(arrival, { fingerprint: preview.fingerprint, unsignedRead: true }, actor, deps, { requestedByAgentId: agent.id })
    const asset = await prisma.asset.findFirstOrThrow({ include: { currentVersion: true, pinChanges: true } })
    expect(asset.currentVersion).toMatchObject({ byId: person.id, requestedByAgentId: agent.id })
    expect(asset.pinChanges).toMatchObject([{ byId: person.id, requestedByAgentId: agent.id }])
  })

  it('is never taken from what a person\'s client confirms', async () => {
    const args = await uploadArgs()
    const preview = await previewAssetInstall(args, ctx as never)
    const confirm = { fingerprint: preview.fingerprint, unsignedRead: true, requestedByAgentId: agent.id }
    await installAsset({ ...args, confirm } as never, ctx as never)
    const asset = await prisma.asset.findFirstOrThrow({ include: { currentVersion: true, pinChanges: true } })
    expect(asset.currentVersion).toMatchObject({ byId: person.id, requestedByAgentId: null })
    expect(asset.pinChanges).toMatchObject([{ requestedByAgentId: null }])
  })
})
