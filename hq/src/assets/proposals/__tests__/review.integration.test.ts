/**
 * Integration tests (ADR-0094, real test DB) for reviewing a proposal (spec part 5 *Proposing*; D27; board C3 §4):
 * only the level's reviewers accept or reject; accepting publishes through the level's own path and, in a place,
 * switches on what was published; edit then accept is recorded as accepted with changes; a rejection needs a note;
 * the outcome is written for the agent; the person may aim a waiting proposal elsewhere; rejected ones go after 90 days.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../places/siteSkills', () => import('../../places/__tests__/fakeSite'))

import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'
import { sealText } from '../../../conversations/sealing'
import { disk } from '../../places/__tests__/fakeSite'
import { proposeSkill } from '../propose'
import { acceptProposal, rejectProposal } from '../review'
import { aimProposal, openProposals, removeOldRejected } from '../queue'
import { viewProposal } from '../view'
import { SKILL_OUTCOME_TARGET } from '../types'

const MD = (name: string, body = 'Do it.') => `---\nname: ${name}\ndescription: Does ${name}. Use when asked.\n---\n\n# ${name}\n${body}\n`
const args = (name: string, aim: string) => ({ name, description: name, files: { 'SKILL.md': MD(name) }, why: 'Reviews went well.', aim })

let agent: { id: string }
let project: { id: string }
let member: { id: string }
let projectAdmin: { id: string }
let orgAdmin: { id: string }
let conversationId: string
let runs = 0

beforeEach(async () => {
  disk.clear()
  await prisma.org.create({ data: { name: 'Fernhill' } })
  agent = await createAgent({ name: 'Ada' })
  project = await createProject({ name: 'Website rebuild' })
  member = await createUserWithRole('MEMBER')
  projectAdmin = await createUserWithRole('MEMBER', { displayName: 'Avery Chen' })
  orgAdmin = await createUserWithRole('ADMIN', { displayName: 'Sam Rivera' })
  await joinProjectAs(project.id, member.id, 'MEMBER')
  await joinProjectAs(project.id, projectAdmin.id, 'ADMIN')
  const c = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: project.id, openedById: member.id, agentId: agent.id } })
  conversationId = c.id
})

/** A proposal from a task run started in the member's conversation. */
async function proposed(name: string, aim: string): Promise<{ id: string; digest: string }> {
  const runId = `site-run-${++runs}`
  await prisma.operation.create({
    data: { conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: runId, state: 'RUNNING', title: sealText('w'), authorisedById: member.id, runId },
  })
  const out = await proposeSkill(prisma, { agentId: agent.id, runId, forUserId: member.id, ownConversation: false, projectId: project.id }, args(name, aim))
  if (out.landed !== 'proposal') throw new Error('expected a proposal')
  return prisma.proposal.findUniqueOrThrow({ where: { id: out.proposal }, select: { id: true, digest: true } })
}

async function outcomeLines() {
  const { readMessages } = await import('../../../conversations/store/messages')
  return (await readMessages(conversationId, { limit: 50 })).filter(m => m.kind === 'ACTION' && m.body.target?.kind === SKILL_OUTCOME_TARGET).map(m => m.kind === 'ACTION' ? m.body.text : '')
}

describe('reviewing a project proposal @D27 @SC-1663', () => {
  it('is for the project\'s administrators: a member and an organisation administrator outside it are refused', async () => {
    const p = await proposed('checkout-review', 'project')
    await expect(acceptProposal(prisma, member.id, { proposalId: p.id, digest: p.digest })).rejects.toThrow(/administrators/)
    await expect(acceptProposal(prisma, orgAdmin.id, { proposalId: p.id, digest: p.digest })).rejects.toThrow()
    expect(await openProposals(prisma, member.id, { level: 'project', projectId: project.id })).toEqual([])
    expect(await openProposals(prisma, projectAdmin.id, { level: 'project', projectId: project.id })).toHaveLength(1)
  })

  it('accepting publishes version 1 into the place, switched on, and tells the agent', async () => {
    const p = await proposed('checkout-review', 'project')
    const out = await acceptProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest })
    expect(out).toEqual({ state: 'ACCEPTED', version: 'version 1', assetId: null, switchedOn: true })
    const skill = await prisma.placeSkill.findFirstOrThrow({ where: { placeId: project.id } })
    expect(skill).toMatchObject({ switch: 'ON', switchFingerprint: skill.lastFingerprint })
    const version = await prisma.placeSkillVersion.findFirstOrThrow({ where: { placeSkillId: skill.id } })
    expect(version).toMatchObject({ number: 1, publishedById: projectAdmin.id })
    expect(version.note).toMatch(/^Proposed by Ada for .+: Reviews went well\./)
    expect(await prisma.proposal.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ state: 'ACCEPTED', reviewedById: projectAdmin.id, resultVersionId: version.id })
    expect(await outcomeLines()).toEqual(['Your proposed skill checkout-review was accepted by Avery Chen.'])
  })

  it('edit then accept publishes the edited files, recorded as accepted with changes', async () => {
    const p = await proposed('checkout-review', 'project')
    const out = await acceptProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest, files: [{ path: 'SKILL.md', text: MD('checkout-review', 'Also the expired card.') }] })
    expect(out.state).toBe('ACCEPTED_WITH_CHANGES')
    expect((await outcomeLines())[0]).toMatch(/accepted with changes by Avery Chen/)
  })

  it('refuses a review of content other than what the proposal holds, and a second review', async () => {
    const p = await proposed('checkout-review', 'project')
    await expect(acceptProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: 'f'.repeat(64) })).rejects.toMatchObject({ status: 409 })
    await rejectProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest, note: 'We have one already.' })
    await expect(acceptProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest })).rejects.toMatchObject({ status: 409 })
  })

  it('a rejection needs a note, writes nothing live, and tells the agent why', async () => {
    const p = await proposed('checkout-review', 'project')
    await expect(rejectProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest, note: '' })).rejects.toThrow(/why/)
    await rejectProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest, note: 'Add it to Review a release.' })
    expect(await prisma.placeSkill.count()).toBe(0)
    expect(await outcomeLines()).toEqual(['Your proposed skill checkout-review was not accepted by Avery Chen: "Add it to Review a release."'])
  })
})

describe('the organisation\'s Library @SC-1663', () => {
  it('an administrator accepts it as version 1.0.0 of the organisation\'s own skill, which no agent has yet', async () => {
    const p = await proposed('release-notes', 'organisation')
    const out = await acceptProposal(prisma, orgAdmin.id, { proposalId: p.id, digest: p.digest })
    expect(out.version).toMatch(/\/release-notes 1\.0\.0$/)
    const asset = await prisma.asset.findFirstOrThrow({ include: { currentVersion: true } })
    expect(asset).toMatchObject({ givenToAll: false, currentVersion: { byId: orgAdmin.id } })
    // So the reviewer can go on to Add to agents… on its page (board R1).
    expect(out.assetId).toBe(asset.id)
  })

  it('names the conversation it came from only to a viewer who may read that conversation', async () => {
    const p = await proposed('release-notes', 'organisation')
    expect((await viewProposal(prisma, member.id, p.id)).conversationId).toBe(conversationId)
    expect((await viewProposal(prisma, orgAdmin.id, p.id)).conversationId).toBeNull()
  })
})

describe('the person it was proposed for @SC-1663', () => {
  it('sees it and may aim it at their own space, and only they may', async () => {
    await createProject({ name: 'Your space', personalOwnerId: member.id, personalSpace: true })
    const p = await proposed('my-notes', 'organisation')
    const view = await viewProposal(prisma, member.id, p.id)
    expect(view).toMatchObject({ mayReview: false, mayAim: true, aims: ['organisation', 'project', 'person'] })
    await expect(aimProposal(prisma, projectAdmin.id, { proposalId: p.id, aim: 'person' })).rejects.toMatchObject({ status: 404 })
    await aimProposal(prisma, member.id, { proposalId: p.id, aim: 'person' })
    expect(await prisma.proposal.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ aim: 'PERSON', placeId: member.id })
    expect((await viewProposal(prisma, member.id, p.id)).mayReview).toBe(true)
  })

  it('is not shown to someone who is neither its person nor a reviewer', async () => {
    const p = await proposed('checkout-review', 'project')
    const stranger = await createUserWithRole('MEMBER')
    await expect(viewProposal(prisma, stranger.id, p.id)).rejects.toMatchObject({ status: 404 })
  })
})

describe('rejected proposals are removed 90 days after review (RQ5) @SC-1663', () => {
  it('removes only rejected ones reviewed before then', async () => {
    const old = await proposed('old-one', 'project')
    const open = await proposed('open-one', 'project')
    await rejectProposal(prisma, projectAdmin.id, { proposalId: old.id, digest: old.digest, note: 'No.' })
    expect(await removeOldRejected(prisma, new Date(Date.now() + 89 * 86_400_000))).toBe(0)
    expect(await removeOldRejected(prisma, new Date(Date.now() + 91 * 86_400_000))).toBe(1)
    expect((await prisma.proposal.findMany({ select: { id: true } })).map(r => r.id)).toEqual([open.id])
  })
})
