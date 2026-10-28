/**
 * Integration tests (ADR-0094, real test DB) for the review screens' reads (spec part 5; board R1): proposals by the level
 * they aim at, listed only for the people who review that level; the full review of one, with the difference from what
 * is in use; and the Overview's item, read from the proposals so handling the last one clears it. Not run by the lane
 * that wrote it; the lead runs it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../places/siteSkills', () => import('../../../places/__tests__/fakeSite'))

import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../../test/factories'
import { sealText } from '../../../../conversations/sealing'
import { disk } from '../../../places/__tests__/fakeSite'
import { proposeSkill } from '../../../proposals/propose'
import { acceptProposal } from '../../../proposals/review'
import { skillProposalsItem } from '../attention'
import { proposalReview } from '../proposalReview'
import { proposalQueues } from '../queues'

const MD = (name: string) => `---\nname: ${name}\ndescription: Does ${name}. Use when asked.\n---\n\n# ${name}\n`
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
  member = await createUserWithRole('MEMBER', { displayName: 'Sam' })
  projectAdmin = await createUserWithRole('MEMBER', { displayName: 'Avery Chen' })
  orgAdmin = await createUserWithRole('ADMIN', { displayName: 'Lee Park' })
  await joinProjectAs(project.id, member.id, 'MEMBER')
  await joinProjectAs(project.id, projectAdmin.id, 'ADMIN')
  conversationId = (await prisma.conversation.create({ data: { home: 'PROJECT', projectId: project.id, openedById: member.id, agentId: agent.id } })).id
})

async function proposed(name: string, aim: string) {
  const runId = `site-run-${++runs}`
  await prisma.operation.create({
    data: { conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: runId, state: 'RUNNING', title: sealText('w'), authorisedById: member.id, runId },
  })
  const out = await proposeSkill(prisma, { agentId: agent.id, runId, forUserId: member.id, ownConversation: false, projectId: project.id }, args(name, aim))
  if (out.landed !== 'proposal') throw new Error('expected a proposal')
  return prisma.proposal.findUniqueOrThrow({ where: { id: out.proposal }, select: { id: true, digest: true } })
}

describe('proposals by level @board-R1 @SC-1663', () => {
  it('lists each level only for the people who review it', async () => {
    await proposed('release-notes', 'organisation')
    await proposed('checkout-review', 'project')
    expect((await proposalQueues(prisma, orgAdmin.id)).map(l => [l.level, l.open.length])).toEqual([['organisation', 1], ['person', 0]])
    expect((await proposalQueues(prisma, projectAdmin.id)).map(l => [l.level, l.label, l.open.length])).toEqual([['project', 'Website rebuild', 1], ['person', 'Your space', 0]])
    expect((await proposalQueues(prisma, member.id)).map(l => l.level)).toEqual(['person'])
  })

  it('moves a reviewed proposal to the decided list, with who decided', async () => {
    const p = await proposed('checkout-review', 'project')
    await acceptProposal(prisma, projectAdmin.id, { proposalId: p.id, digest: p.digest })
    const level = (await proposalQueues(prisma, projectAdmin.id)).find(l => l.level === 'project')!
    expect(level.open).toEqual([])
    expect(level.decided).toEqual([expect.objectContaining({ name: 'checkout-review', state: 'ACCEPTED', reviewedBy: 'Avery Chen', proposedBy: 'Ada' })])
  })
})

describe('reviewing one @board-R1 @SC-1663', () => {
  it('shows a new skill as all added, every file with its bytes, and what accepting would make', async () => {
    const p = await proposed('release-notes', 'organisation')
    const review = await proposalReview(prisma, orgAdmin.id, p.id)
    expect(review.changes.map(c => [c.path, c.status])).toEqual([['SKILL.md', 'added']])
    expect(review.files[0]).toMatchObject({ path: 'SKILL.md', base64: expect.any(String) })
    expect(review.acceptsAs).toBe('1.0.0')
    expect(review.proposal.mayReview).toBe(true)
  })

  it('is seen only by the person it was made for and the people who review its level', async () => {
    const p = await proposed('release-notes', 'organisation')
    await expect(proposalReview(prisma, projectAdmin.id, p.id)).rejects.toMatchObject({ status: 404 })
    expect((await proposalReview(prisma, member.id, p.id)).proposal.mayReview).toBe(false)
  })
})

describe("the Overview's item @board-R1 @SC-1663", () => {
  it('stands for the proposals aimed at the organisation, and goes when they are handled', async () => {
    expect(await skillProposalsItem(prisma, orgAdmin.id)).toBeNull()
    const p = await proposed('release-notes', 'organisation')
    const item = await skillProposalsItem(prisma, orgAdmin.id)
    expect(item).toMatchObject({ title: '1 skill proposal waiting', actionLabel: 'Review', actionUrl: `/library/proposals/${p.id}` })
    expect(item!.body).toContain('From Ada')
    expect(await skillProposalsItem(prisma, member.id)).toBeNull()
    await acceptProposal(prisma, orgAdmin.id, { proposalId: p.id, digest: p.digest })
    expect(await skillProposalsItem(prisma, orgAdmin.id)).toBeNull()
  })

  it("counts a project's proposals for its administrator only, and the queue opens when there are several", async () => {
    const forProject = await proposed('checkout-review', 'project')
    expect(await skillProposalsItem(prisma, orgAdmin.id)).toBeNull()
    expect(await skillProposalsItem(prisma, member.id)).toBeNull()
    expect(await skillProposalsItem(prisma, projectAdmin.id)).toMatchObject({ title: '1 skill proposal waiting', actionUrl: `/library/proposals/${forProject.id}` })
    await proposed('release-notes', 'organisation')
    expect(await skillProposalsItem(prisma, orgAdmin.id)).toMatchObject({ title: '1 skill proposal waiting' })
    expect(await skillProposalsItem(prisma, projectAdmin.id)).toMatchObject({ title: '1 skill proposal waiting', actionUrl: `/library/proposals/${forProject.id}` })
  })

  it('counts every level the person reviews together, and opens the queue', async () => {
    await proposed('release-notes', 'organisation')
    await proposed('checkout-review', 'project')
    expect(await skillProposalsItem(prisma, orgAdmin.id)).toMatchObject({ title: '1 skill proposal waiting' })
    await joinProjectAs(project.id, orgAdmin.id, 'ADMIN')
    expect(await skillProposalsItem(prisma, orgAdmin.id)).toMatchObject({ title: '2 skill proposals waiting', actionUrl: '/library/proposals' })
  })
})
