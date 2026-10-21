/**
 * A preview's row (SC-227) and its end: it never outlives the session that
 * started it, every path that ends a session ends its previews at once, and a
 * preview ended that way is refused at the door. Nothing in the database reaches
 * a PreviewSession from its session (`sessionId` carries no relation), so each
 * path has to say so itself. Against the real test database; only the site
 * (through the shared fakes) stands in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createUserWithRole, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

import {
  createPreview, getById, touch, listExpired, markStatus, expirePreviewsForSession, _resetCache,
  type CreatePreviewInput,
} from '../previewRegistry'
import { authorizePreview, canAccess } from '../previewAuth'
import { archiveSession, updateSession, deleteTaskSession } from '../../sessions/actions'
import { archiveTaskSession } from '../../agents/taskSessionArchive'
import { clearTaskSession } from '../../projects/actions'
import { removePerson } from '../../settings/leaving'
import { deleteAgent } from '../../agents/agentService'

beforeEach(() => { _resetCache() })
afterEach(() => { vi.useRealTimers() })

const ctx = (user: { id: string }) =>
  ({
    user,
    entities: { AgentSession: prisma.agentSession, Task: prisma.task, UserSettings: prisma.userSettings, User: prisma.user },
  }) as any

async function chat(data: Record<string, unknown> = {}) {
  const owner = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } })
  const session = await createSession({ userId: owner.id, primaryOwnerType: 'project', primaryOwnerId: project.id, ...data })
  return { owner, project, session }
}

function input(over: Partial<CreatePreviewInput> & { sessionId: string | null; agentId: string; ownerId: string }): CreatePreviewInput {
  return {
    siteId: 'site-b', previewId: 'pv-9', command: 'npm run dev', ttlMs: 600_000,
    ownerType: 'project', workspaceId: null, taskId: null, ...over,
  }
}

const startFor = (s: { id: string; agentId: string; primaryOwnerId: string | null }, ttlMs = 600_000) =>
  createPreview(input({ sessionId: s.id, agentId: s.agentId, ownerId: s.primaryOwnerId!, ttlMs }))

const statusOf = async (id: string) => (await prisma.previewSession.findUniqueOrThrow({ where: { id } })).status

describe('previewRegistry @SC-227', () => {
  it('stores a starting preview with a token of 24 random bytes, naming its site and the site\'s own id', async () => {
    const { session } = await chat()
    const row = await startFor(session)

    expect(Buffer.from(row.token, 'base64url')).toHaveLength(24)
    expect(await prisma.previewSession.findUniqueOrThrow({ where: { id: row.id } }))
      .toMatchObject({ siteId: 'site-b', previewId: 'pv-9', status: 'starting', sessionId: session.id })
  })

  it('expires at its own TTL when the session outlasts it, or has no end of its own', async () => {
    const long = (await chat({ expiresAt: new Date(Date.now() + 10 * 3_600_000) })).session
    const open = (await chat()).session
    for (const s of [long, open]) {
      const row = await startFor(s)
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600_000)
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 590_000)
    }
  })

  it('never outlives the session that started it', async () => {
    const end = new Date(Date.now() + 60_000)
    const { session } = await chat({ expiresAt: end })
    expect((await startFor(session)).expiresAt).toEqual(end)
  })

  it('lists for the sweep every row past its expiry that is not confirmed stopped, stopping ones included', async () => {
    const { session } = await chat()
    const past = new Date(Date.now() - 1000)
    const make = (status: string, expiresAt: Date) =>
      prisma.previewSession.create({
        data: { token: `t-${status}-${expiresAt.getTime()}`, agentId: session.agentId, siteId: 's', previewId: 'p', command: 'c', status, expiresAt },
      })
    const running = await make('running', past)
    const stopping = await make('stopping', past)
    await make('expired', past)
    await make('running', new Date(Date.now() + 60_000))

    const due = await listExpired(new Date())

    expect(due.map((r) => r.id).sort()).toEqual([running.id, stopping.id].sort())
  })
})

// The cache is what a preview host resolves through, so a stale entry in it is a
// preview that goes on admitting people after it was ended.
describe('the cache cannot outlive the row it holds', () => {
  it('answers a created row from memory, and re-reads it once past its freshness bound', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { session } = await chat()
    const row = await startFor(session)
    await prisma.previewSession.delete({ where: { id: row.id } })

    expect((await getById(row.id))?.id).toBe(row.id)

    vi.setSystemTime(new Date(Date.now() + 10_000))
    expect(await getById(row.id)).toBeNull()
  })

  it('reads a row it does not hold from the database', async () => {
    const { session } = await chat()
    const row = await startFor(session)
    _resetCache()
    expect((await getById(row.id))?.id).toBe(row.id)
  })

  it('touch records the access and keeps caching a live row', async () => {
    const { session } = await chat()
    const row = await startFor(session)
    await markStatus(row.id, 'running')

    await touch(row.id)

    expect((await prisma.previewSession.findUniqueOrThrow({ where: { id: row.id } })).lastAccessAt).toBeInstanceOf(Date)
    expect((await getById(row.id))?.status).toBe('running')
  })

  // The race: a request already in flight when the session ended commits its
  // own `touch` after the expiry's cache delete has run.
  it('does not put a row back that was ended while a request was in flight', async () => {
    const { session } = await chat()
    const row = await startFor(session)
    await prisma.previewSession.update({ where: { id: row.id }, data: { status: 'stopping' } })

    await touch(row.id)

    expect((await getById(row.id))?.status).toBe('stopping')
  })

  it('markStatus drops a stopping or expired row from the cache', async () => {
    const { session } = await chat()
    const row = await startFor(session)
    await markStatus(row.id, 'stopping')
    expect((await getById(row.id))?.status).toBe('stopping')
  })
})

describe('ending a session ends its previews', () => {
  it("moves the session's live previews to stopping with an expiry of now, leaving the rest", async () => {
    const { session } = await chat()
    const live = await startFor(session)
    const chased = await startFor(session)
    await prisma.previewSession.update({ where: { id: chased.id }, data: { status: 'stopping', expiresAt: new Date('2030-01-01') } })
    const before = Date.now()

    expect(await expirePreviewsForSession(session.id)).toBe(1)

    const ended = await prisma.previewSession.findUniqueOrThrow({ where: { id: live.id } })
    expect(ended.status).toBe('stopping')
    expect(ended.expiresAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(ended.expiresAt.getTime()).toBeLessThanOrEqual(Date.now())
    // A row the sweep is already chasing keeps its own state.
    expect((await prisma.previewSession.findUniqueOrThrow({ where: { id: chased.id } })).expiresAt).toEqual(new Date('2030-01-01'))
  })

  it.each([
    ['archived', (s: any, o: any) => archiveSession({ id: s.id }, ctx(o))],
    ['archived through the update path', (s: any, o: any) => updateSession({ id: s.id, status: 'ARCHIVED' }, ctx(o))],
    ['marked expired through the update path', (s: any, o: any) => updateSession({ id: s.id, status: 'EXPIRED' }, ctx(o))],
    ['deleted', (s: any, o: any) => deleteTaskSession({ sessionId: s.id }, ctx(o))],
  ])('ends them when the session is %s', async (_how, end) => {
    const { owner, session } = await chat()
    const row = await startFor(session)

    await end(session, owner)

    expect(await statusOf(row.id)).toBe('stopping')
  })

  it('leaves a live preview alone when the update is only a model change', async () => {
    const { owner, session } = await chat()
    const row = await startFor(session)

    await updateSession({ id: session.id, model: 'some-model' }, ctx(owner))

    expect(await statusOf(row.id)).toBe('starting')
  })

  // The automatic path: a finished task archives its own session.
  it('ends them when a finished task archives its own session', async () => {
    const owner = await createUserWithRole('MEMBER')
    const project = await createProject()
    const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: owner.id } })
    const session = await createSession({ userId: owner.id, taskId: task.id, sessionType: 'task' })
    const row = await createPreview(input({ sessionId: session.id, agentId: session.agentId, ownerId: project.id }))

    await archiveTaskSession('site-1', task.id, session.id, 'DONE')

    expect(await statusOf(row.id)).toBe('stopping')
  })
})

describe('ending many sessions at once ends their previews', () => {
  it("ends them when a task's context is cleared", async () => {
    const owner = await createUserWithRole('MEMBER')
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } })
    const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: owner.id } })
    const session = await createSession({ userId: owner.id, taskId: task.id, sessionType: 'task' })
    const row = await createPreview(input({ sessionId: session.id, agentId: session.agentId, ownerId: project.id }))

    await clearTaskSession({ taskId: task.id }, ctx(owner))

    expect(await statusOf(row.id)).toBe('stopping')
  })

  it('ends them when a person is removed', async () => {
    const admin = await createUserWithRole('ADMIN')
    const { owner, session } = await chat()
    const row = await startFor(session)

    await removePerson({ userId: owner.id }, ctx(admin))

    expect(await statusOf(row.id)).toBe('stopping')
  })

  it('ends them when the agent that owned them is deleted', async () => {
    const agent = await createAgent()
    const { session } = await chat({ agentId: agent.id })
    const row = await startFor(session)

    await deleteAgent(agent.id)

    expect(await statusOf(row.id)).toBe('stopping')
  })

  it('writes nothing to a preview of a session that was not ended', async () => {
    const admin = await createUserWithRole('ADMIN')
    const { owner } = await chat()
    const other = (await chat()).session
    const row = await startFor(other)

    await removePerson({ userId: owner.id }, ctx(admin))

    expect(await statusOf(row.id)).toBe('starting')
  })
})

describe('a preview ended with its session is refused at the door', () => {
  it('answers 410 to the preview that was resolving a moment earlier', async () => {
    const { owner, session } = await chat()
    const row = await startFor(session)
    await markStatus(row.id, 'running')

    expect((await authorizePreview(row.id, owner, { getById, canAccess })).ok).toBe(true)

    await archiveSession({ id: session.id }, ctx(owner))

    expect(await authorizePreview(row.id, owner, { getById, canAccess })).toMatchObject({ ok: false, code: 410 })
  })
})
