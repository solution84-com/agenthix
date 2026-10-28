/**
 * start_work against the real test database (conversation layer spec, Commissioning outside the place): offered
 * only where the agent may start work for the person, describing the places they share; refused in words when a
 * check fails; admitting a brief as a queued operation on the conversation's standing worker in that boundary —
 * one worker per boundary, made on first use and reused — and the same brief while it is pending is that one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { createProject, createUserWithRole, joinProjectAs } from '../../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('./workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { openJson, openText, sealJson } from '../../../sealing'
import { createStartWorkTool } from '../startWork'
import { NEVER_ABORTED, addToConversation, world, type World } from './workerFixtures'

let w: World
const movedOn: string[] = []
const tool = createStartWorkTool({ moveOn: id => { movedOn.push(id) } })

beforeEach(async () => {
  movedOn.length = 0
  w = await world()
})

const brief = (over: Record<string, unknown> = {}) =>
  tool.run(w.capability, { boundary: w.project.key, title: 'Profile the image pipeline', brief: 'Measure the resize step.', ...over }, NEVER_ABORTED)

describe('start_work is offered @SC-960', () => {
  it('to a turn answering a person, describing the places they share by key and name', async () => {
    expect(await tool.offered(w.capability)).toBe(true)
    const description = await tool.describe(w.capability)
    expect(description).toContain("- personal: the person's own space")
    expect(description).toContain(`- ${w.project.key}: the Shop project`)
    expect(description).toMatch(/ask which/)
  })

  it("listing apart the projects the person works in that the agent isn't assigned to", async () => {
    const walkthrough = await createProject({ name: 'Walkthrough' })
    await joinProjectAs(walkthrough.id, w.person.id, 'MEMBER')
    await addToConversation(w.conversation.id, w.person.id, walkthrough.id)
    const description = await tool.describe(w.capability)
    const [canStart, unassigned] = description.split("that you aren't assigned to")
    expect(canStart).toContain(`- ${w.project.key}: the Shop project`)
    expect(canStart).not.toContain('Walkthrough')
    expect(unassigned).toContain(`- ${walkthrough.key}: the Walkthrough project`)
  })

  it('never to a report turn, a turn that answers no one, or a turn whose authority has expired', async () => {
    expect(await tool.offered({ ...w.capability, trigger: 'REPORT' })).toBe(false)
    expect(await tool.offered({ ...w.capability, actingUserId: null, readerUserId: w.person.id })).toBe(false)
    expect(await tool.offered({ ...w.capability, expiresAt: Date.now() - 1 })).toBe(false)
  })

  it('not at all when the agent may start work nowhere for the person', async () => {
    await prisma.agent.update({ where: { id: w.agent.id }, data: { allowedTools: [{ name: 'start_work', state: 'never' }] } })
    expect(await tool.offered(w.capability)).toBe(false)
  })
})

describe('start_work refuses, in words @SC-960 @SC-961', () => {
  it('a place that does not exist, naming the places there are by key and name', async () => {
    const outcome = await brief({ boundary: 'NOPE' })
    expect(outcome).toEqual({
      status: 'refused',
      reason: `there is no project with the key or name "NOPE"; the places you can work in are: personal (your space), ${w.project.key} (Shop)`,
    })
  })

  it("a project the agent isn't assigned to, saying so and how a project admin assigns it, starting nothing", async () => {
    const walkthrough = await createProject({ name: 'Walkthrough' })
    await joinProjectAs(walkthrough.id, w.person.id, 'MEMBER')
    await addToConversation(w.conversation.id, w.person.id, walkthrough.id)
    for (const boundary of [walkthrough.key, 'Walkthrough', 'the Walkthrough project']) {
      expect(await brief({ boundary })).toEqual({
        status: 'refused',
        reason: "Developer isn't assigned to Walkthrough; a project admin can assign Developer there: in Walkthrough, open Members, select ＋ Add, then An agent, and Assign beside Developer",
      })
    }
    expect(await prisma.operation.count()).toBe(0)
    expect(await prisma.agentSession.count()).toBe(0)
  })

  it('a name more than one project has, naming each by key', async () => {
    const a = await createProject({ name: 'Twin' })
    const b = await createProject({ name: 'Twin' })
    for (const p of [a, b]) {
      await joinProjectAs(p.id, w.person.id, 'MEMBER')
      await prisma.projectAgent.create({ data: { projectId: p.id, agentId: w.agent.id } })
    }
    const [first, second] = [a, b].sort((x, y) => (x.key < y.key ? -1 : 1))
    expect(await brief({ boundary: 'twin' })).toEqual({
      status: 'refused',
      reason: `more than one project is called "twin": ${first!.key} (Twin), ${second!.key} (Twin); pass the key of the one you mean`,
    })
  })

  it('a project the person is not a member of', async () => {
    const finance = await createProject({ name: 'Finance' })
    await prisma.projectAgent.create({ data: { projectId: finance.id, agentId: w.agent.id } })
    expect(await brief({ boundary: finance.key })).toEqual({ status: 'refused', reason: "you're not a member of Finance" })
    expect(await prisma.operation.count()).toBe(0)
    expect(await prisma.agentSession.count()).toBe(0)
  })

  it('arguments that do not fit', async () => {
    expect(await brief({ brief: '' })).toMatchObject({ status: 'refused' })
  })
})

describe('start_work admits a brief @SC-960', () => {
  it("in a project named by its name as well as by its key", async () => {
    for (const boundary of ['Shop', 'the shop project', w.project.key.toLowerCase()]) {
      const outcome = await brief({ boundary, brief: `Measure the resize step (${boundary}).` })
      expect(outcome).toMatchObject({ status: 'accepted' })
      const op = await prisma.operation.findUniqueOrThrow({ where: { id: (outcome as { operationId: string }).operationId } })
      expect(op).toMatchObject({ boundaryType: 'project', boundaryId: w.project.id })
    }
  })

  it("as a queued background operation on the conversation's new standing worker in that boundary", async () => {
    const outcome = await brief({ effort: 'heavy', then: 'fix the slowest step' })
    expect(outcome.status).toBe('accepted')
    const op = await prisma.operation.findUniqueOrThrow({ where: { id: (outcome as { operationId: string }).operationId } })
    expect(op).toMatchObject({
      kind: 'WORKER', mode: 'BACKGROUND', state: 'QUEUED', toolName: 'start_work', conversationId: w.conversation.id,
      turnId: w.capability.turnId, boundaryType: 'project', boundaryId: w.project.id, authorisedById: w.person.id,
    })
    expect(openText(op.title)).toBe('Profile the image pipeline')
    expect(openText(op.brief!)).toBe('Measure the resize step.')
    expect(openJson(op.args!)).toEqual({ effort: 'heavy' })
    expect(op.continuation).toMatchObject({ authorisedById: w.person.id, nextStep: 'fix the slowest step', depth: 1 })

    const worker = await prisma.agentSession.findUniqueOrThrow({ where: { id: op.workerSessionId! } })
    expect(worker).toMatchObject({
      conversationId: w.conversation.id, primaryOwnerType: 'project', primaryOwnerId: w.project.id,
      userId: w.person.id, agentId: w.agent.id, sessionType: 'chat', taskId: null, status: 'ACTIVE',
    })
    expect(siteStore.createSession).toHaveBeenCalledWith('site-1', expect.objectContaining({ id: worker.id, primaryOwnerId: w.project.id }))
    expect(movedOn).toEqual([worker.id])
  })

  it('carrying the skill the person picked with `/` for the message the turn answers', async () => {
    const said = (seq: number, body: object) => prisma.conversationMessage.create({
      data: { conversationId: w.conversation.id, seq, role: 'PERSON', kind: 'TEXT', body: sealJson(body), authorId: w.person.id, turnId: w.capability.turnId },
    })
    await said(1, { text: 'review this', skill: { name: 'org-code-review' } })
    await said(2, { text: 'and be brief' })
    const outcome = await brief()
    const op = await prisma.operation.findUniqueOrThrow({ where: { id: (outcome as { operationId: string }).operationId } })
    expect(openJson(op.args!)).toEqual({ effort: 'light', skill: { name: 'org-code-review' } })
  })

  it('carrying no skill when the picked one is not a name a skill can have', async () => {
    await prisma.conversationMessage.create({
      data: { conversationId: w.conversation.id, seq: 1, role: 'PERSON', kind: 'TEXT', body: sealJson({ text: 'x', skill: { name: '/init' } }), authorId: w.person.id, turnId: w.capability.turnId },
    })
    const op = await prisma.operation.findUniqueOrThrow({ where: { id: ((await brief()) as { operationId: string }).operationId } })
    expect(openJson(op.args!)).toEqual({ effort: 'light' })
  })

  it('on the same worker for a later brief to the same boundary, and on another for another boundary', async () => {
    const first = await brief()
    const second = await brief({ brief: 'Now the crop step.' })
    const personal = await brief({ boundary: 'personal', brief: 'Tidy my notes.' })
    const ops = await prisma.operation.findMany({ where: { id: { in: [first, second, personal].map(o => (o as { operationId: string }).operationId) } } })
    const workers = new Set(ops.map(o => o.workerSessionId))
    expect(workers.size).toBe(2)
    expect(await prisma.agentSession.count({ where: { conversationId: w.conversation.id } })).toBe(2)
    const own = await prisma.agentSession.findFirstOrThrow({ where: { conversationId: w.conversation.id, primaryOwnerType: 'user' } })
    expect(own.primaryOwnerId).toBe(w.person.id)
  })

  it('once: the same brief to the same boundary while it is pending is that one', async () => {
    const first = await brief()
    expect(await brief({ title: 'Another title' })).toEqual(first)
    expect(await prisma.operation.count()).toBe(1)
    await prisma.operation.update({ where: { id: (first as { operationId: string }).operationId }, data: { state: 'COMPLETED', idempotencyKey: 'moved-aside' } })
    expect(await brief()).not.toEqual(first)
  })

  it('on a fresh worker when the standing worker there lost its harness state, which closes nothing', async () => {
    const first = await brief()
    await prisma.agentSession.updateMany({ where: { conversationId: w.conversation.id }, data: { status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' } })
    const outcome = await brief({ brief: 'Something new.' })
    expect(outcome).toMatchObject({ status: 'accepted' })
    const [a, b] = await Promise.all([first, outcome].map(o => prisma.operation.findUniqueOrThrow({ where: { id: (o as { operationId: string }).operationId } })))
    expect(b.workerSessionId).not.toBe(a.workerSessionId)
    const fresh = await prisma.agentSession.findUniqueOrThrow({ where: { id: b.workerSessionId as string } })
    expect(fresh).toMatchObject({ status: 'ACTIVE', workerGeneration: 1 })
  })

  it('not when the standing worker there has closed because its person left the project', async () => {
    await brief()
    await prisma.agentSession.updateMany({ where: { conversationId: w.conversation.id }, data: { status: 'CLOSED', closedReason: 'LEFT_PROJECT' } })
    const outcome = await brief({ brief: 'Something new.' })
    expect(outcome).toMatchObject({ status: 'refused' })
    expect((outcome as { reason: string }).reason).toMatch(/^work in Shop can't go on in this conversation/)
  })

  it('for two people briefing one boundary, on a worker of each, each acting as its own person', async () => {
    const mine = await brief()
    const other = await createUserWithRole('MEMBER')
    await joinProjectAs(w.project.id, other.id, 'MEMBER')
    const theirs = await tool.run({ ...w.capability, actingUserId: other.id }, { boundary: w.project.key, title: 'Theirs', brief: 'Theirs.' }, NEVER_ABORTED)
    expect(theirs.status).toBe('accepted')
    const [a, b] = await Promise.all([mine, theirs].map(o => prisma.operation.findUniqueOrThrow({ where: { id: (o as { operationId: string }).operationId } })))
    expect(a.workerSessionId).not.toBe(b.workerSessionId)
    const workers = await prisma.agentSession.findMany({ where: { conversationId: w.conversation.id }, orderBy: { createdAt: 'asc' } })
    expect(workers.map(s => [s.id, s.userId, s.primaryOwnerId])).toEqual([
      [a.workerSessionId, w.person.id, w.project.id],
      [b.workerSessionId, other.id, w.project.id],
    ])
    expect([a.authorisedById, b.authorisedById]).toEqual([w.person.id, other.id])
  })
})

describe("start_work reaches only the conversation's places (adr-0152) @SC-1442", () => {
  const notIn = (name: string) =>
    `${name} isn't in this conversation, so no work can start there; the person can add it with Add place… in the ` +
    "conversation's header, or you can ask them to with suggest_place"

  it('refuses a project the person and the agent share that the conversation does not hold, saying the person can add it', async () => {
    const finance = await createProject({ name: 'Finance' })
    await joinProjectAs(finance.id, w.person.id, 'MEMBER')
    await prisma.projectAgent.create({ data: { projectId: finance.id, agentId: w.agent.id } })
    expect(await brief({ boundary: finance.key })).toEqual({ status: 'refused', reason: notIn('Finance') })
    expect(await prisma.operation.count()).toBe(0)
    expect(await prisma.agentSession.count()).toBe(0)
    expect(await tool.describe(w.capability)).not.toContain('Finance')
  })

  it('admits it once the person has added it', async () => {
    const finance = await createProject({ name: 'Finance' })
    await joinProjectAs(finance.id, w.person.id, 'MEMBER')
    await prisma.projectAgent.create({ data: { projectId: finance.id, agentId: w.agent.id } })
    await addToConversation(w.conversation.id, w.person.id, finance.id)
    expect(await brief({ boundary: finance.key })).toMatchObject({ status: 'accepted' })
    expect(await tool.describe(w.capability)).toContain(`- ${finance.key}: the Finance project`)
  })

  it('refuses it again once the person has removed it', async () => {
    await prisma.conversationPlace.deleteMany({ where: { conversationId: w.conversation.id } })
    expect(await brief()).toEqual({ status: 'refused', reason: notIn('Shop') })
  })

  it("refuses the person's own space from a project's conversation that does not hold it", async () => {
    const conversation = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: w.project.id, openedById: w.person.id, agentId: w.agent.id } })
    const capability = { ...w.capability, conversationId: conversation.id, home: 'PROJECT' as const, projectId: w.project.id }
    const outcome = await tool.run(capability, { boundary: 'personal', title: 'Notes', brief: 'Tidy my notes.' }, NEVER_ABORTED)
    expect(outcome).toEqual({ status: 'refused', reason: notIn('your space') })
    expect(await tool.run(capability, { boundary: w.project.key, title: 'Shop', brief: 'Measure.' }, NEVER_ABORTED)).toMatchObject({ status: 'accepted' })
  })
})
