/**
 * Leaving the organisation (adr-0100), against the real test DB: Remove
 * deactivates and deletes nothing, ends every sign-in and connection, ends
 * their projects, and sends their open tasks where the admin chose for each
 * project, or leaves them waiting; Reactivate restores the same account; the
 * last-admin rule holds. Erase is erasePerson.integration.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createSession, createProject, createAgent, createTestTask, createConversation } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { removePerson, reactivatePerson } from '../leaving'
import { refuseLogin } from '../../auth/refuseLogin'
import { isProjectMember } from '../../projects/membership'
import { personMayWorkInProject, LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import { countOrgPeople } from '../../server/identity/orgPeople'

const ctx = (userId: string) => ({ user: { id: userId } }) as any

let taskNumber = 0
const taskFor = (projectId: string, onBehalfOfUserId: string, data: Record<string, unknown> = {}) =>
  createTestTask({ data: { title: 'A task', projectId, number: ++taskNumber, onBehalfOfUserId, ...data } as any })

async function signedIn(userId: string) {
  const auth = await prisma.auth.create({ data: { userId } })
  await prisma.session.create({ data: { id: crypto.randomUUID(), userId: auth.id, expiresAt: new Date(Date.now() + 60_000) } })
}

/** A project with an admin who stays, and the person who leaves as a member. */
async function teamWith(leaving: { id: string }, admin: { id: string }) {
  const project = await createProject()
  await prisma.projectMember.createMany({ data: [
    { projectId: project.id, userId: admin.id, role: 'ADMIN' },
    { projectId: project.id, userId: leaving.id, role: 'MEMBER' },
  ] })
  return project
}

describe('removePerson — deactivates, deletes nothing @SC-606', () => {
  it('marks them left, ends every sign-in, pairing token and connection, and keeps their account and conversations', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    await signedIn(target.id)
    const chat = await createSession({ userId: target.id })
    await prisma.mobileAuthToken.create({ data: { userId: target.id, expiresAt: new Date(Date.now() + 60_000) } })
    await prisma.personConnection.create({
      data: { userId: target.id, name: 'Laptop', tokenHash: 'c'.repeat(64), tokenPrefix: 'pc_', expiresAt: new Date(Date.now() + 60_000) },
    })
    const personal = await createProject({ personalOwnerId: target.id })

    await expect(removePerson({ userId: target.id }, ctx(admin.id))).resolves.toMatchObject({ ok: true })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(user.deactivatedAt).not.toBeNull()
    expect(await prisma.session.count({ where: { auth: { userId: target.id } } })).toBe(0)
    expect(await prisma.mobileAuthToken.count({ where: { userId: target.id } })).toBe(0)
    expect((await prisma.personConnection.findFirstOrThrow({ where: { userId: target.id } })).revokedAt).not.toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: chat.id } })).not.toBeNull()
    expect(await prisma.project.findUnique({ where: { id: personal.id } })).not.toBeNull()
    expect(await prisma.userSettings.findUnique({ where: { userId: target.id } })).not.toBeNull()
  })

  it('leaves them out of every project, every access check and the count of people', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const project = await teamWith(target, admin)
    const personal = await createProject({ personalOwnerId: target.id })
    const before = await countOrgPeople()

    await removePerson({ userId: target.id }, ctx(admin.id))

    expect(await isProjectMember(project.id, target.id)).toBe(false)
    expect(await isProjectMember(personal.id, target.id)).toBe(false)
    expect(await personMayWorkInProject(project.id, target.id)).toBe(false)
    expect(await countOrgPeople()).toBe(before - 1)
  })

  it('holds personLeftOrganisation for each site that is not revoked', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const a = await prisma.executionSite.create({ data: { siteId: crypto.randomUUID(), label: 'A', status: 'OFFLINE' } })
    await prisma.executionSite.create({ data: { siteId: crypto.randomUUID(), label: 'Gone', status: 'REVOKED' } })

    await removePerson({ userId: target.id }, ctx(admin.id))

    const held = await prisma.heldSiteInstruction.findMany()
    expect(held.map(r => r.siteId)).toContain(a.siteId)
    for (const row of held) expect(row).toMatchObject({ method: 'membership.personLeftOrganisation', params: { userId: target.id } })
  })

  it('refuses a non-admin, your own account, and someone who has already left', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    const left = await createUserWithRole('MEMBER', { deactivatedAt: new Date() })
    await expect(removePerson({ userId: member.id }, ctx(member.id))).rejects.toMatchObject({ statusCode: 403 })
    await expect(removePerson({ userId: admin.id }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
    await expect(removePerson({ userId: left.id }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('removePerson — their conversations in hq', () => {
  it('closes the ones they opened, keeping what was said, and leaves everyone else\'s open', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const project = await createProject()
    const own = await createConversation({ openedById: target.id })
    const inProject = await createConversation({ openedById: target.id, home: 'PROJECT', projectId: project.id })
    const someoneElses = await createConversation({ openedById: admin.id })

    await removePerson({ userId: target.id }, ctx(admin.id))

    for (const id of [own.id, inProject.id]) {
      expect(await prisma.conversation.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'CLOSED', closedReason: 'LEFT_ORGANISATION' })
    }
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: someoneElses.id } })).status).toBe('ACTIVE')
  })
})

describe('removePerson — their teams @SC-606', () => {
  it('takes them out of every team, so no later change to a team brings them back into its projects', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const team = await prisma.team.create({ data: { name: 'Marketing', people: { create: [{ userId: target.id }, { userId: admin.id }] } } })

    await removePerson({ userId: target.id }, ctx(admin.id))

    expect(await prisma.teamPerson.findMany({ where: { teamId: team.id }, select: { userId: true } })).toEqual([{ userId: admin.id }])
  })
})

describe('removePerson — a project always has an admin @SC-607', () => {
  it('refuses, names every project it would orphan, and changes nothing', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const web = await createProject({ name: 'Website', key: 'WEB' })
    await prisma.projectMember.create({ data: { projectId: web.id, userId: target.id, role: 'ADMIN' } })

    await expect(removePerson({ userId: target.id }, ctx(admin.id))).rejects.toThrow(/Website \(WEB\)/)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deactivatedAt).toBeNull()
    expect(await isProjectMember(web.id, target.id)).toBe(true)
    expect(await prisma.heldSiteInstruction.count()).toBe(0)
  })
})

describe('removePerson — their open tasks @SC-607', () => {
  it('asks where they go in each project with open tasks on their behalf, and changes nothing until told', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const project = await teamWith(target, admin)
    await taskFor(project.id, target.id)

    await expect(removePerson({ userId: target.id }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deactivatedAt).toBeNull()
  })

  it('hands them to the member the admin chose, or leaves them waiting, project by project', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const handed = await teamWith(target, admin)
    const waits = await teamWith(target, admin)
    const agent = await createAgent()
    const toHand = await taskFor(handed.id, target.id, { assignedAgentId: agent.id })
    const toWait = await taskFor(waits.id, target.id, { assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    const done = await taskFor(waits.id, target.id, { status: 'DONE' })

    const result = await removePerson({
      userId: target.id,
      openTasks: [
        { projectId: handed.id, destination: { kind: 'person', userId: admin.id } },
        { projectId: waits.id, destination: { kind: 'wait' } },
      ],
    }, ctx(admin.id))

    expect(result).toEqual({ ok: true, moved: 1, waiting: 1 })
    const read = (id: string) => prisma.task.findUniqueOrThrow({ where: { id }, select: { onBehalfOfUserId: true, runState: true, runStateReason: true } })
    expect(await read(toHand.id)).toMatchObject({ onBehalfOfUserId: admin.id, runState: 'RUN_NONE' })
    // Blocked, not stopped: a run in progress finishes first.
    expect(await read(toWait.id)).toMatchObject({ onBehalfOfUserId: target.id, runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    expect((await read(done.id)).runState).toBe('RUN_NONE')
  })

  it('refuses handing them to someone who is not in that project', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const project = await teamWith(target, admin)
    const outsider = await createUser()
    await taskFor(project.id, target.id)

    await expect(removePerson({
      userId: target.id, openTasks: [{ projectId: project.id, destination: { kind: 'person', userId: outsider.id } }],
    }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('leaves the tasks in a private project the admin is not in waiting, without asking about it', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const other = await createUser()
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.createMany({ data: [
      { projectId: hidden.id, userId: other.id, role: 'ADMIN' },
      { projectId: hidden.id, userId: target.id, role: 'MEMBER' },
    ] })
    const task = await taskFor(hidden.id, target.id)

    await expect(removePerson({ userId: target.id }, ctx(admin.id))).resolves.toMatchObject({ waiting: 1 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).runStateReason).toBe(LOST_ACCESS_REASON)
  })
})

describe('reactivatePerson @SC-608', () => {
  it('restores the same account, without its projects', async () => {
    const admin = await createUserWithRole('ADMIN')
    const target = await createUserWithRole('MEMBER')
    const project = await teamWith(target, admin)
    await removePerson({ userId: target.id }, ctx(admin.id))

    await expect(reactivatePerson({ userId: target.id }, ctx(admin.id))).resolves.toEqual({ ok: true })

    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deactivatedAt).toBeNull()
    expect(await isProjectMember(project.id, target.id)).toBe(false)
  })

  it('refuses someone who has not left, and someone erased', async () => {
    const admin = await createUserWithRole('ADMIN')
    const here = await createUserWithRole('MEMBER')
    const erased = await createUser({ deactivatedAt: new Date(), erasedAt: new Date() })
    await expect(reactivatePerson({ userId: here.id }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
    await expect(reactivatePerson({ userId: erased.id }, ctx(admin.id))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('signing in @SC-608', () => {
  it('is refused for someone who has left, and allowed again once reactivated', async () => {
    const left = await createUser({ deactivatedAt: new Date() })
    const here = await createUser()
    await expect(refuseLogin({ user: left } as any)).rejects.toMatchObject({ statusCode: 403 })
    await expect(refuseLogin({ user: here } as any)).resolves.toBeUndefined()
  })
})
