/**
 * Archive, against the real test database (on-screen spec, Archive, never prune by itself): the daily sweep at the
 * organisation's days, keep, reopen, the archived list and its search, a person's message opening an archived
 * conversation again, and the run search asking only the sites of the conversation's own runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUserWithRole, joinProjectAs, ensureExecutionSite } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))

import * as siteStore from '../../../test/fakes/siteRuntimeStore'
import { sealJson, sealText } from '../../sealing'
import { appendMessage } from '../../store/messages'
import { archiveIdleConversations } from '../idle'
import { getArchivedConversations, reopenConversation, searchConversationRuns, setConversationKeep } from '../operations'

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)
const ctx = (id: string) => ({ user: { id } })

let personId: string
let agentId: string
let projectId: string

async function conversation(over: Record<string, unknown> = {}) {
  return prisma.conversation.create({
    data: { home: 'PROJECT', projectId, openedById: personId, agentId, lastMessageAt: ago(100), ...over } as never,
  })
}
const stale = (id: string, days = 100) => prisma.$executeRaw`UPDATE "Conversation" SET "updatedAt" = ${ago(days)}, "lastMessageAt" = ${ago(days)} WHERE id = ${id}`
const statusOf = async (id: string) => (await prisma.conversation.findUniqueOrThrow({ where: { id } })).status

beforeEach(async () => {
  siteStore.reset()
  const person = await createUserWithRole('MEMBER')
  personId = person.id
  agentId = (await createAgent()).id
  const project = await createProject({ name: 'Shop' })
  projectId = project.id
  await joinProjectAs(projectId, personId, 'MEMBER')
  await prisma.org.create({ data: { name: 'Test organisation' } })
})

describe('the idle sweep @SC-974', () => {
  it('archives a conversation idle past the period, and only that', async () => {
    const idle = await conversation()
    const recent = await conversation({ lastMessageAt: ago(10) })
    await stale(idle.id)
    expect(await archiveIdleConversations()).toBe(1)
    expect(await statusOf(idle.id)).toBe('ARCHIVED')
    expect(await statusOf(recent.id)).toBe('ACTIVE')
  })

  it('leaves one idle for less than the period', async () => {
    const c = await conversation()
    await stale(c.id, 40)
    expect(await archiveIdleConversations()).toBe(0)
  })

  it('leaves alone one kept out of archiving, and one with work going on', async () => {
    const kept = await conversation({ keep: true })
    const working = await conversation()
    await prisma.operation.create({
      data: { conversationId: working.id, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'brief_worker', idempotencyKey: 'k', state: 'RUNNING', title: sealText('Profile'), authorisedById: personId },
    })
    for (const c of [kept, working]) await stale(c.id)
    expect(await archiveIdleConversations()).toBe(0)
  })
})

describe('keep, reopen and the archived list @SC-974', () => {
  it('keeps one out of archiving, and only its opener may say so', async () => {
    const c = await conversation()
    await setConversationKeep({ conversationId: c.id, keep: true }, ctx(personId))
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: c.id } })).keep).toBe(true)
    const other = await createUserWithRole('MEMBER')
    await expect(setConversationKeep({ conversationId: c.id, keep: false }, ctx(other.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reopens an archived conversation, and is not archived again until idle for the whole period', async () => {
    const c = await conversation()
    await stale(c.id)
    await archiveIdleConversations()
    await reopenConversation({ conversationId: c.id }, ctx(personId))
    expect(await statusOf(c.id)).toBe('ACTIVE')
    expect(await archiveIdleConversations()).toBe(0)
    await expect(reopenConversation({ conversationId: c.id }, ctx(personId))).rejects.toMatchObject({ statusCode: 409 })
  })

  it("lets a Viewer of the project read a task's thread but neither keep it nor reopen it", async () => {
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(projectId, viewer.id, 'VIEWER')
    const task = await createTestTask({ data: { title: 'Fix it', projectId, number: 1, onBehalfOfUserId: personId, assignedAgentId: agentId } as never })
    const thread = await conversation({ home: 'TASK', taskId: task.id, status: 'ARCHIVED', archivedAt: ago(1) })

    await expect(setConversationKeep({ conversationId: thread.id, keep: true }, ctx(viewer.id))).rejects.toMatchObject({ statusCode: 409 })
    await expect(reopenConversation({ conversationId: thread.id }, ctx(viewer.id))).rejects.toMatchObject({ statusCode: 409 })
    expect(await statusOf(thread.id)).toBe('ARCHIVED')

    await reopenConversation({ conversationId: thread.id }, ctx(personId))
    expect(await statusOf(thread.id)).toBe('ACTIVE')
  })

  it('lists the archived ones of a place and finds one by its title, its agent or what was said in it', async () => {
    const a = await conversation({ title: 'Pricing page', status: 'ARCHIVED', archivedAt: new Date() })
    const b = await conversation({ title: 'Footer links', status: 'ARCHIVED', archivedAt: new Date() })
    await conversation({ title: 'Still open' })
    await prisma.conversationMessage.create({ data: { conversationId: b.id, seq: 1, role: 'PERSON', authorId: personId, kind: 'TEXT', body: sealJson({ text: 'Move the sitemap into the footer' }) } })
    const args = { home: 'PROJECT' as const, projectId }
    expect((await getArchivedConversations(args, ctx(personId))).conversations.map(c => c.id).sort()).toEqual([a.id, b.id].sort())
    expect((await getArchivedConversations({ ...args, query: 'pricing' }, ctx(personId))).conversations.map(c => c.id)).toEqual([a.id])
    expect((await getArchivedConversations({ ...args, query: 'sitemap' }, ctx(personId))).conversations.map(c => c.id)).toEqual([b.id])
  })

  it('opens an archived conversation again when its person writes in it', async () => {
    const c = await conversation({ status: 'ARCHIVED', archivedAt: new Date() })
    await appendMessage({ conversationId: c.id, role: 'PERSON', kind: 'TEXT', body: { text: 'Back again' }, authorId: personId, clientMessageId: 'm1' } as never)
    expect(await statusOf(c.id)).toBe('ACTIVE')
  })
})

describe('searching a conversation\'s runs @SC-973', () => {
  it('asks only the sites of its own runs, finds what they said, and names a site that is down', async () => {
    await ensureExecutionSite({ siteId: 'up', protocolVersion: SITE_PROTOCOL_VERSION })
    await ensureExecutionSite({ siteId: 'down', protocolVersion: SITE_PROTOCOL_VERSION })
    const c = await conversation()
    const make = (key: string, siteId: string, runId: string) => prisma.operation.create({
      data: { conversationId: c.id, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'brief_worker', idempotencyKey: key, state: 'COMPLETED', title: sealText(`Work ${key}`), authorisedById: personId, siteId, runId },
    })
    await make('a', 'up', 'r1')
    await make('b', 'down', 'r2')
    siteStore.addRun('up', { id: 'r1', sessionId: 'sess-1', agentId, outputText: 'The cache was cold' })
    siteStore.makeSiteUnreachable('down')
    const result = await searchConversationRuns({ conversationId: c.id, query: 'cache' }, ctx(personId))
    expect(result.hits).toMatchObject([{ runId: 'r1', sessionId: 'sess-1', title: 'Work a' }])
    expect(result.unavailable).toHaveLength(1)
  })

  it('asks no site for an empty search', async () => {
    const c = await conversation()
    expect(await searchConversationRuns({ conversationId: c.id, query: ' ' }, ctx(personId))).toEqual({ hits: [], unavailable: [] })
  })
})
