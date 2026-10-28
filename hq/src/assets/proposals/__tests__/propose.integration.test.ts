/**
 * Integration tests (ADR-0094, real test DB) for `propose_skill` (spec part 5 *Proposing*; adr-0159; security review
 * H5): it lands as the person's draft only from their own interactive conversation where they may edit; from a task
 * run, a Bypassed agent's included, and for a person who may not edit there, it is a proposal; nothing it makes is
 * live; the person is the run's, never an argument's; at most five per run; the card is written in the conversation.
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
import { proposeSkill } from '../propose'
import type { ProposingRun } from '../caller'
import { skillCardOf, MAX_PROPOSALS_PER_RUN } from '../types'

const MD = (name: string, body = 'Do it.') => `---\nname: ${name}\ndescription: Does ${name}. Use when asked.\n---\n\n# ${name}\n${body}\n`
const args = (name: string, aim: string, over: Record<string, unknown> = {}) => ({
  name, description: `Does ${name}`, files: { 'SKILL.md': MD(name) }, why: 'It went well.', aim, ...over,
})

let agent: { id: string }
let project: { id: string }
let member: { id: string }
let projectAdmin: { id: string }
let orgAdmin: { id: string }

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  // Bypassed: every tool runs without asking. A proposal still waits for a person.
  agent = await createAgent({ name: 'Ada', approval: 'bypassed' })
  project = await createProject({ name: 'Website rebuild' })
  member = await createUserWithRole('MEMBER')
  projectAdmin = await createUserWithRole('MEMBER')
  orgAdmin = await createUserWithRole('ADMIN')
  await joinProjectAs(project.id, member.id, 'MEMBER')
  await joinProjectAs(project.id, projectAdmin.id, 'ADMIN')
  await joinProjectAs(project.id, orgAdmin.id, 'MEMBER')
})

let runs = 0
function run(forUserId: string, over: Partial<ProposingRun> = {}): ProposingRun {
  return { agentId: agent.id, runId: `site-run-${++runs}`, forUserId, ownConversation: true, projectId: project.id, ...over }
}

async function conversationFor(runId: string, personId: string) {
  const c = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: project.id, openedById: personId, agentId: agent.id } })
  await prisma.operation.create({
    data: {
      conversationId: c.id, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: `w-${runId}`, state: 'RUNNING',
      title: sealText('Make it a skill'), authorisedById: personId, runId,
    },
  })
  return c.id
}

async function cards(conversationId: string) {
  const { readMessages } = await import('../../../conversations/store/messages')
  return (await readMessages(conversationId, { limit: 50 })).filter(m => m.kind === 'ACTION').map(m => m.kind === 'ACTION' ? skillCardOf(m.body) : null)
}

const live = async () => ({ versions: await prisma.assetVersion.count(), placeVersions: await prisma.placeSkillVersion.count() })

describe('propose_skill routing @H5', () => {
  it("is the person's own draft from their own conversation where they may edit, with the agent and run recorded", async () => {
    const r = run(member.id)
    const conversationId = await conversationFor(r.runId, member.id)
    const out = await proposeSkill(prisma, r, args('checkout-review', 'project'))
    expect(out).toMatchObject({ landed: 'draft', revision: 1 })
    const skill = await prisma.placeSkill.findFirstOrThrow({ where: { placeType: 'project', placeId: project.id } })
    expect(skill).toMatchObject({ path: '.agents/skills/checkout-review', lastFingerprint: null, switch: null })
    const revision = await prisma.draftRevision.findFirstOrThrow({})
    expect(revision).toMatchObject({ authorId: member.id, proposedByAgentId: agent.id, proposedByRunId: r.runId, conversationId })
    expect(await prisma.proposal.count()).toBe(0)
    expect(await live()).toEqual({ versions: 0, placeVersions: 0 })
    expect(await cards(conversationId)).toEqual([{ kind: 'draft', draft: { kind: 'place', id: skill.id }, name: 'checkout-review', revision: 1 }])
  })

  it("is a proposal from a task run, even for an organisation administrator, and the agent is Bypassed", async () => {
    const r = run(orgAdmin.id, { ownConversation: false })
    const out = await proposeSkill(prisma, r, args('release-notes', 'organisation'))
    expect(out).toMatchObject({ landed: 'proposal', reviewers: "the organisation's administrators and Library maintainers" })
    expect(await prisma.proposal.findFirstOrThrow({})).toMatchObject({
      aim: 'ORGANISATION', placeId: null, state: 'OPEN', agentId: agent.id, forUserId: orgAdmin.id, runId: r.runId,
    })
    expect(await prisma.asset.count()).toBe(0)
    expect(await live()).toEqual({ versions: 0, placeVersions: 0 })
  })

  it('is a proposal for the project when the person may not edit at the organisation', async () => {
    const out = await proposeSkill(prisma, run(member.id), args('release-notes', 'organisation'))
    expect(out.landed).toBe('proposal')
    expect(await prisma.draft.count()).toBe(0)
  })

  it("aims person at the run's own person, whatever an argument names", async () => {
    const space = await createProject({ name: 'Your space', personalOwnerId: member.id, personalSpace: true })
    const out = await proposeSkill(prisma, run(member.id, { ownConversation: false }), {
      ...args('my-notes', 'person'), forUserId: orgAdmin.id, person: orgAdmin.id, userId: orgAdmin.id,
    })
    expect(out.landed).toBe('proposal')
    expect(await prisma.proposal.findFirstOrThrow({})).toMatchObject({ aim: 'PERSON', placeId: member.id, forUserId: member.id })
    expect(space.id).toBeTruthy()
  })

  it('refuses a person who only reads the project', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(project.id, viewer.id, 'VIEWER')
    await expect(proposeSkill(prisma, run(viewer.id), args('x', 'project'))).rejects.toMatchObject({ status: 403 })
  })

  it('answers the same content again with the open proposal, and refuses other content under that name while it waits', async () => {
    const first = await proposeSkill(prisma, run(member.id, { ownConversation: false }), args('notes', 'project'))
    const again = await proposeSkill(prisma, run(member.id, { ownConversation: false }), args('notes', 'project'))
    expect(again).toMatchObject({ landed: 'proposal', proposal: (first as { proposal: string }).proposal })
    await expect(proposeSkill(prisma, run(member.id, { ownConversation: false }), args('notes', 'project', { files: { 'SKILL.md': MD('notes', 'Other.') } })))
      .rejects.toMatchObject({ status: 409 })
  })

  it(`allows at most ${MAX_PROPOSALS_PER_RUN} per run`, async () => {
    const r = run(member.id, { ownConversation: false })
    for (let i = 0; i < MAX_PROPOSALS_PER_RUN; i++) await proposeSkill(prisma, r, args(`skill-${i}`, 'project'))
    await expect(proposeSkill(prisma, r, args('one-more', 'project'))).rejects.toMatchObject({ status: 429 })
  })

  it('refuses a new Library skill whose name the organisation already has, pointing at edits', async () => {
    await proposeSkill(prisma, run(orgAdmin.id), args('release-notes', 'organisation'))
    await expect(proposeSkill(prisma, run(orgAdmin.id), args('release-notes', 'organisation'))).rejects.toThrow(/edits:/)
  })

  it("updates the organisation's own skill as a draft for an administrator in their own conversation", async () => {
    const first = await proposeSkill(prisma, run(orgAdmin.id), args('release-notes', 'organisation'))
    expect(first.landed).toBe('draft')
    const asset = await prisma.asset.findFirstOrThrow({})
    const second = await proposeSkill(prisma, run(orgAdmin.id), args('release-notes', 'organisation', {
      edits: `${asset.publisher}/release-notes`, files: { 'SKILL.md': MD('release-notes', 'Shorter.') },
    }))
    expect(second).toMatchObject({ landed: 'draft', revision: 2 })
    expect(asset.currentVersionId).toBeNull()
  })
})
