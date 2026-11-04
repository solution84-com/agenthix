import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { DEFAULT_SITE_ID } from '../../test/fakes/dispatchService'
import { addRun } from '../../test/fakes/siteRuntimeStore'
import { dismissNotification, markNotificationsRead } from '../actions'
import { getNotifications } from '../queries'

// SC-109 — view notifications, mark them seen, dismiss a notification, against the real test database.

const ctx = (user?: { id: string }) => ({ user, entities: { Notification: prisma.notification } }) as any

function notify(userId: string, data: Record<string, unknown> = {}) {
  return prisma.notification.create({
    data: { userId, type: 'credential_health', title: 'Set up', body: 'Finish setting up', ...data },
  })
}

describe('getNotifications @SC-109 @SC-525', () => {
  it("returns the caller's notifications that are not dismissed: what needs them first, then the rest, each newest first", async () => {
    const me = await createUser()
    const other = await createUser()
    const older = await notify(me.id, { title: 'older', createdAt: new Date('2026-01-01') })
    const newer = await notify(me.id, { title: 'newer', status: 'read', createdAt: new Date('2026-02-01') })
    const handled = await notify(me.id, { title: 'handled', status: 'handled', createdAt: new Date('2026-03-01') })
    await notify(me.id, { status: 'dismissed' })
    await notify(other.id)

    const result = await getNotifications(undefined as any, ctx(me))

    expect(result.map((n) => n.id)).toEqual([newer.id, older.id, handled.id])
  })

  it('names the task a notification is about, and the first thing its tool request wants to run', async () => {
    const me = await createUser()
    // A task key is two to six capitals, a dash and a number.
    const project = await createProject({ accessLevel: 'OPEN', key: 'WEB' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    // A task whose request waits is blocked on it (the run state the status listener sets).
    const task = await createTestTask({
      data: { title: 'Fix the checkout redirect', projectId: project.id, number: 27, onBehalfOfUserId: me.id, runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' } as any,
    })
    await prisma.taskComment.create({
      data: {
        taskId: task.id, authorType: 'AGENT',
        content: `__MANIFEST_APPROVAL__:${JSON.stringify({ runId: 'r1', summary: 's', pendingManifest: { tools: [], bashPatterns: [{ pattern: 'npm run deploy:preview' }] } })}`,
      } as any,
    })
    // The request still waits: its task is blocked and its session's newest run is pending approval on the site.
    const session = await createSession({ userId: me.id, taskId: task.id, sessionType: 'task' })
    addRun(DEFAULT_SITE_ID, { id: `r1-${session.id}`, sessionId: session.id, manifestStatus: 'PENDING_APPROVAL' } as never)
    await notify(me.id, { type: 'tool_approval', title: `Approval needed on ${project.key}-27`, actionUrl: `/tasks/${project.key}-27` })

    const [n] = await getNotifications(undefined as any, ctx(me))

    expect(n).toMatchObject({
      task: { key: `${project.key}-27`, title: 'Fix the checkout redirect' },
      command: 'npm run deploy:preview',
    })
  })

  it("lists a task once, by its latest request, and handles the older ones", async () => {
    const me = await createUser()
    const url = '/tasks/WEB-17'
    // The task exists and still waits on its newest request, which the site still holds pending.
    const project = await createProject({ accessLevel: 'OPEN', key: 'WEB' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    const task = await createTestTask({ data: { title: 'Seventeen', projectId: project.id, number: 17, onBehalfOfUserId: me.id, runState: 'RUN_BLOCKED' } as any })
    const session = await createSession({ userId: me.id, taskId: task.id, sessionType: 'task' })
    addRun(DEFAULT_SITE_ID, { id: `r-${session.id}`, sessionId: session.id, manifestStatus: 'PENDING_APPROVAL' } as never)
    const oldest = await notify(me.id, { type: 'tool_approval', actionUrl: url, createdAt: new Date('2026-01-01') })
    const old = await notify(me.id, { type: 'tool_approval', actionUrl: url, createdAt: new Date('2026-02-01') })
    const latest = await notify(me.id, { type: 'tool_approval', actionUrl: url, createdAt: new Date('2026-03-01') })

    const result = await getNotifications(undefined as any, ctx(me))

    expect(result.map((n) => n.id)).toEqual([latest.id])
    const rows = await prisma.notification.findMany({ where: { id: { in: [oldest.id, old.id, latest.id] } } })
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [oldest.id]: 'handled', [old.id]: 'handled', [latest.id]: 'unread',
    })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getNotifications(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('markNotificationsRead @SC-109 @SC-526', () => {
  it('marks only the named notifications seen, and only if they were unread', async () => {
    const me = await createUser()
    const seen = await notify(me.id)
    const notInView = await notify(me.id)
    const handled = await notify(me.id, { status: 'handled' })

    await markNotificationsRead({ ids: [seen.id, handled.id] }, ctx(me))

    const status = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).status
    expect(await status(seen.id)).toBe('read')
    expect(await status(notInView.id)).toBe('unread')
    expect(await status(handled.id)).toBe('handled')
  })

  it('refuses an empty list of ids (400)', async () => {
    const me = await createUser()
    await expect(markNotificationsRead({ ids: [] }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })

  it("marks the caller's unread notifications read and leaves the rest alone", async () => {
    const me = await createUser()
    const other = await createUser()
    const unread = await notify(me.id)
    const dismissed = await notify(me.id, { status: 'dismissed' })
    const theirs = await notify(other.id)

    await markNotificationsRead(undefined as any, ctx(me))

    const status = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).status
    expect(await status(unread.id)).toBe('read')
    expect(await status(dismissed.id)).toBe('dismissed')
    expect(await status(theirs.id)).toBe('unread')
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(markNotificationsRead(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('dismissNotification @SC-109 @SC-525', () => {
  it('dismisses one of the caller\'s notifications', async () => {
    const me = await createUser()
    const n = await notify(me.id)

    await dismissNotification({ id: n.id }, ctx(me))

    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe('dismissed')
    expect(await getNotifications(undefined as any, ctx(me))).toEqual([])
  })

  it("leaves another person's notification untouched", async () => {
    const me = await createUser()
    const other = await createUser()
    const theirs = await notify(other.id)

    await dismissNotification({ id: theirs.id }, ctx(me))

    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe('unread')
  })

  it('refuses a missing id (400) and a caller who is not signed in (401)', async () => {
    const me = await createUser()
    await expect(dismissNotification({ id: '' }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(dismissNotification({ id: 'n1' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
