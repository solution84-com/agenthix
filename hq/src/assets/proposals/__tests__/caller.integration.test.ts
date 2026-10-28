/**
 * Integration tests (ADR-0094, real test DB) for who calls `propose_skill` (security review H5): the run must be the
 * capability's own; the person is its on-behalf-of person; and only a turn of that person's own conversation, or work it
 * handed on, counts as their own interactive conversation. A task's run, a scheduled one and someone else's never do.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))

import { addRun } from '../../../test/fakes/siteRuntimeStore'
import { createAgent, createSession, createUserWithRole } from '../../../test/factories'
import { ownConversationOf, proposingRun } from '../caller'

const SITE = 'site-1'
let person: { id: string }
let other: { id: string }
let agent: { id: string }

beforeEach(async () => {
  person = await createUserWithRole('MEMBER')
  other = await createUserWithRole('MEMBER')
  agent = await createAgent()
})

async function callerFor(session: { id: string; userId: string; taskId?: string | null }, claims: Record<string, unknown> = {}) {
  addRun(SITE, { id: `run-${session.id}`, sessionId: session.id, taskId: session.taskId ?? null, status: 'RUNNING' })
  const ctx = {
    kind: 'run' as const,
    claims: { siteId: SITE, sessionId: session.id, taskId: session.taskId ?? null, projectId: null, userId: session.userId, agentId: agent.id, startedBy: 'person', ...claims },
  }
  return proposingRun(ctx as never, `run-${session.id}`)
}

describe('the run that proposes @security-H5 @SC-1661', () => {
  it("is the person's own conversation in their own chat", async () => {
    const s = await createSession({ userId: person.id, agentId: agent.id, sessionType: 'chat' })
    expect(await callerFor(s)).toMatchObject({ forUserId: person.id, ownConversation: true })
  })

  it("is the person's own conversation in work their own conversation handed on", async () => {
    const c = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
    const s = await createSession({ userId: person.id, agentId: agent.id, sessionType: 'chat', conversationId: c.id })
    expect((await callerFor(s)).ownConversation).toBe(true)
  })

  it("is not in a conversation someone else opened", async () => {
    const c = await prisma.conversation.create({ data: { home: 'PERSON', openedById: other.id, agentId: agent.id } })
    const s = await createSession({ userId: person.id, agentId: agent.id, sessionType: 'chat', conversationId: c.id })
    expect((await callerFor(s)).ownConversation).toBe(false)
  })

  it("is not a task's run, even one the person started", async () => {
    const session = { sessionType: 'chat', taskId: 'task-1', userId: person.id, conversationId: null }
    expect(await ownConversationOf({ startedBy: 'person', taskId: 'task-1' }, session, person.id)).toBe(false)
  })

  it('is not in a scheduled or automated run', async () => {
    const s = await createSession({ userId: person.id, agentId: agent.id, sessionType: 'chat' })
    expect((await callerFor(s, { startedBy: 'schedule' })).ownConversation).toBe(false)
  })

  it('refuses a run that is not the capability\'s own', async () => {
    const s = await createSession({ userId: person.id, agentId: agent.id, sessionType: 'chat' })
    addRun(SITE, { id: 'someone-elses', sessionId: 'another-session', status: 'RUNNING' })
    const ctx = { kind: 'run', claims: { siteId: SITE, sessionId: s.id, taskId: null, projectId: null, userId: person.id, agentId: agent.id, startedBy: 'person' } }
    await expect(proposingRun(ctx as never, 'someone-elses')).rejects.toThrow(/not this one/)
  })

  it('is for an agent\'s run only', async () => {
    await expect(proposingRun({ kind: 'connection' } as never, 'x')).rejects.toThrow(/agent's run/)
  })
})
