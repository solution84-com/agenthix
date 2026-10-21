/**
 * Erase (adr-0100), against the real test DB, with the site's runtime store
 * replaced by its shared fake: only after Remove, confirmed by their name;
 * deletes the person's own data, found by what they own; keeps every
 * project's tasks, comments and task runs, which then name them "Former
 * member". A project task's session filed under an admin for
 * bookkeeping survives that admin's erase, on hq and on the site.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createSession, createProject, createAgent, createTestTask, ensureExecutionSite, createConversation } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { erasePerson } from '../erasePerson'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { personById } from '../../server/identity/people'
import { FORMER_MEMBER } from '../../server/identity/personSummary'

const ctx = (userId: string) => ({ user: { id: userId } }) as any

let taskNumber = 0
const taskFor = (projectId: string, onBehalfOfUserId: string, data: Record<string, unknown> = {}) =>
  createTestTask({ data: { title: 'A task', projectId, number: ++taskNumber, onBehalfOfUserId, ...data } as any })

/** A person who has left, with a login named after their handle. */
async function leftPerson(handle = `dana${++taskNumber}`, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const user = await createUserWithRole(role, { deactivatedAt: new Date(), displayName: 'Dana Reyes' })
  await prisma.auth.create({ data: { userId: user.id, identities: { create: { providerName: 'username', providerUserId: handle } } } })
  return { user, handle }
}

describe('erasePerson — when it may run @SC-609', () => {
  it('refuses someone who has not left, a wrong name, and a non-admin', async () => {
    const admin = await createUserWithRole('ADMIN')
    const here = await createUserWithRole('MEMBER', { displayName: 'Here' })
    const { user: left } = await leftPerson()
    await expect(erasePerson({ userId: here.id, confirm: 'Here' }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
    await expect(erasePerson({ userId: left.id, confirm: 'Somebody' }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
    await expect(erasePerson({ userId: left.id, confirm: 'Dana Reyes' }, ctx(here.id))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: left.id } })).erasedAt).toBeNull()
  })

  it('takes the handle, with or without its @, as confirmation', async () => {
    const admin = await createUserWithRole('ADMIN')
    const { user, handle } = await leftPerson()
    await expect(erasePerson({ userId: user.id, confirm: `@${handle}` }, ctx(admin.id))).resolves.toEqual({ ok: true })
  })
})

describe('erasePerson — what goes @SC-609', () => {
  it('their conversations, own project, memory, connections, logins, name, picture and sign-in', async () => {
    const admin = await createUserWithRole('ADMIN')
    const { user } = await leftPerson()
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: '/people/x/images/a.png' } })
    const chat = await createSession({ userId: user.id })
    const personal = await createProject({ personalOwnerId: user.id })
    await taskFor(personal.id, user.id)
    const agent = await createAgent()
    const item = { title: 'Tea', body: 'Likes tea more than coffee.', kind: 'PREFERENCE' as const }
    await prisma.memoryItem.create({ data: { ...item, scope: 'AGENT_PERSON', scopeKey: `agent-person:${agent.id}:${user.id}`, key: 'tea', userId: user.id, agentId: agent.id } })
    await prisma.memoryItem.create({ data: { ...item, scope: 'AGENT_PLACE', scopeKey: `agent-place:${agent.id}:user:${user.id}`, key: 'tea', agentId: agent.id, placeType: 'user', placeId: user.id } })
    await prisma.personConnection.create({
      data: { userId: user.id, name: 'Laptop', tokenHash: 'e'.repeat(64), tokenPrefix: 'pc_', expiresAt: new Date(Date.now() + 60_000) },
    })
    await prisma.modelCredential.create({ data: { kind: 'API_KEY', ownerType: 'user', ownerId: user.id, secret: 'x' } })

    await erasePerson({ userId: user.id, confirm: 'Dana Reyes' }, ctx(admin.id))

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row).toMatchObject({ displayName: null, avatarUrl: null })
    expect(row.erasedAt).not.toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: chat.id } })).toBeNull()
    expect(await prisma.project.findUnique({ where: { id: personal.id } })).toBeNull()
    expect(await prisma.memoryItem.count({ where: { OR: [{ userId: user.id }, { placeId: user.id }] } })).toBe(0)
    expect(await prisma.personConnection.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.modelCredential.count({ where: { ownerId: user.id } })).toBe(0)
    expect(await prisma.auth.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.userSettings.count({ where: { userId: user.id } })).toBe(0)
    expect(await personById(user.id)).toMatchObject({ name: FORMER_MEMBER, handle: null, state: 'erased' })
  })
})

describe('erasePerson — their conversations in hq', () => {
  it('deletes the ones they opened in their own space and in projects, with what was said, and no one else\'s', async () => {
    const admin = await createUserWithRole('ADMIN')
    const { user } = await leftPerson()
    const project = await createProject()
    const own = await createConversation({ openedById: user.id })
    const inProject = await createConversation({ openedById: user.id, home: 'PROJECT', projectId: project.id })
    await prisma.conversationMessage.create({ data: { conversationId: own.id, seq: 1, role: 'PERSON', kind: 'TEXT', body: 'sealed' } })
    const someoneElses = await createConversation({ openedById: admin.id })

    await erasePerson({ userId: user.id, confirm: 'Dana Reyes' }, ctx(admin.id))

    expect(await prisma.conversation.count({ where: { id: { in: [own.id, inProject.id] } } })).toBe(0)
    expect(await prisma.conversationMessage.count({ where: { conversationId: own.id } })).toBe(0)
    expect(await prisma.conversation.findUnique({ where: { id: someoneElses.id } })).not.toBeNull()
  })
})

describe('erasePerson — their teams @SC-609', () => {
  it('takes them out of every team', async () => {
    const admin = await createUserWithRole('ADMIN')
    const { user } = await leftPerson()
    await prisma.team.create({ data: { name: 'Support', people: { create: [{ userId: user.id }] } } })

    await erasePerson({ userId: user.id, confirm: 'Dana Reyes' }, ctx(admin.id))

    expect(await prisma.teamPerson.count({ where: { userId: user.id } })).toBe(0)
  })
})

describe('erasePerson — what stays @SC-609', () => {
  it("keeps a project's tasks, comments and task runs, naming them a former member", async () => {
    const admin = await createUserWithRole('ADMIN')
    const { user } = await leftPerson()
    const project = await createProject()
    const task = await taskFor(project.id, user.id)
    const comment = await prisma.taskComment.create({ data: { taskId: task.id, authorType: 'USER', userId: user.id, content: 'Done.' } })

    await erasePerson({ userId: user.id, confirm: 'Dana Reyes' }, ctx(admin.id))

    expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull()
    expect(await prisma.taskComment.findUnique({ where: { id: comment.id } })).not.toBeNull()
  })

  it("erasing an admin who is not a project's last leaves the project's task runs, filed under them, on hq and the site", async () => {
    const site = await ensureExecutionSite()
    const other = await createUserWithRole('ADMIN')
    const { user: bookkeeper } = await leftPerson(undefined, 'ADMIN')
    const project = await createProject({ executionSiteId: site.id })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: other.id, role: 'ADMIN' } })
    const task = await taskFor(project.id, other.id)
    // dispatchService files a project task's session under an admin: bookkeeping, not ownership.
    const taskSession = await createSession({
      userId: bookkeeper.id, sessionType: 'task', taskId: task.id, primaryOwnerType: 'project', primaryOwnerId: project.id,
    })
    const ownChat = await createSession({ userId: bookkeeper.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    siteStore.addSession(site.siteId, { id: taskSession.id, userId: bookkeeper.id, sessionType: 'task', taskId: task.id })
    siteStore.addSession(site.siteId, { id: ownChat.id, userId: bookkeeper.id, sessionType: 'chat' })

    await erasePerson({ userId: bookkeeper.id, confirm: 'Dana Reyes' }, ctx(other.id))

    expect(await prisma.agentSession.findUnique({ where: { id: taskSession.id } })).not.toBeNull()
    expect(await siteStore.getSession(site.siteId, taskSession.id)).not.toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: ownChat.id } })).toBeNull()
    expect(await siteStore.getSession(site.siteId, ownChat.id)).toBeNull()
    for (const call of siteStore.deleteSessionsBy.mock.calls) expect(call[1]).toEqual({ ids: [ownChat.id] })
  })

  it('never makes an erased person a new personal project', async () => {
    const { ensurePersonalProjectsForEveryone } = await import('../../projects/personalProject')
    const erased = await createUser({ deactivatedAt: new Date(), erasedAt: new Date() })
    await ensurePersonalProjectsForEveryone()
    expect(await prisma.project.count({ where: { personalOwnerId: erased.id } })).toBe(0)
  })
})
