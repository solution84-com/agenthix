/**
 * A request left under Needs you after it stopped waiting is handled when the
 * list is read, against the real test database: a tool request once its task is
 * not blocked or the newest run of its session is not pending approval, a waiting notice once its task is no
 * longer blocked or failed — and never when the site cannot be asked.
 */
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
import { addRun, makeSiteUnreachable, makeSiteReachable } from '../../test/fakes/siteRuntimeStore'
import { getNotifications } from '../queries'

let number = 300
// A real key: two to six letters, as projectService requires and the notification links carry.
const letters = () => Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')

async function setup(runState = 'RUN_BLOCKED') {
  const me = await createUser()
  const project = await createProject({ accessLevel: 'OPEN', key: letters() })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
  const task = await createTestTask({ data: { title: 'Fix it', projectId: project.id, number: ++number, onBehalfOfUserId: me.id, runState } as any })
  const session = await createSession({ userId: me.id, taskId: task.id, sessionType: 'task' })
  const note = (type: string) => prisma.notification.create({
    data: { userId: me.id, type, title: 't', body: 'b', actionUrl: `/tasks/${project.key}-${task.number}`, status: 'unread' },
  })
  return { me, session, note }
}

const statusOf = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).status
const read = (userId: string) => getNotifications(undefined as never, { user: { id: userId } } as never)

describe('requests that stopped waiting @SC-527 @SC-643', () => {
  it('handles a tool request whose session has no run pending approval', async () => {
    const { me, session, note } = await setup()
    addRun(DEFAULT_SITE_ID, { id: `r-${session.id}`, sessionId: session.id, manifestStatus: 'REJECTED' } as never)
    const request = await note('tool_approval')

    const list = await read(me.id)

    expect(await statusOf(request.id)).toBe('handled')
    expect(list.find(n => n.id === request.id)?.status).toBe('handled')
  })

  it('keeps a tool request whose run still waits for approval', async () => {
    const { me, session, note } = await setup()
    addRun(DEFAULT_SITE_ID, { id: `r-${session.id}`, sessionId: session.id, manifestStatus: 'PENDING_APPROVAL' } as never)
    const request = await note('tool_approval')

    await read(me.id)

    expect(await statusOf(request.id)).toBe('unread')
  })

  it('handles a tool request a newer run of its session replaced, whatever the older row still says', async () => {
    const { me, session, note } = await setup()
    addRun(DEFAULT_SITE_ID, { id: `old-${session.id}`, sessionId: session.id, manifestStatus: 'PENDING_APPROVAL', createdAt: '2026-10-01T00:00:00.000Z' } as never)
    addRun(DEFAULT_SITE_ID, { id: `new-${session.id}`, sessionId: session.id, manifestStatus: 'APPROVED', createdAt: '2026-10-02T00:00:00.000Z' } as never)
    const request = await note('tool_approval')

    await read(me.id)

    expect(await statusOf(request.id)).toBe('handled')
  })

  it('handles a tool request whose task was dismissed, even while its site still holds it pending', async () => {
    const { me, session, note } = await setup('RUN_NONE')
    addRun(DEFAULT_SITE_ID, { id: `r-${session.id}`, sessionId: session.id, manifestStatus: 'PENDING_APPROVAL' } as never)
    const request = await note('tool_approval')

    await read(me.id)

    expect(await statusOf(request.id)).toBe('handled')
  })

  it('never clears a request when the site cannot be asked', async () => {
    const { me, note } = await setup()
    makeSiteUnreachable(DEFAULT_SITE_ID)
    try {
      const request = await note('tool_approval')
      await read(me.id)
      expect(await statusOf(request.id)).toBe('unread')
    } finally {
      makeSiteReachable(DEFAULT_SITE_ID)
    }
  })

  it('handles a waiting notice once its task is no longer blocked or failed', async () => {
    const { me, note } = await setup('RUN_NONE')
    const waiting = await note('task_waiting')

    await read(me.id)

    expect(await statusOf(waiting.id)).toBe('handled')
  })

  it('handles a request and a waiting notice whose task was deleted', async () => {
    const { me, session, note } = await setup()
    const request = await note('tool_approval')
    const waiting = await note('task_waiting')
    await prisma.agentSession.deleteMany({ where: { id: session.id } })
    await prisma.task.deleteMany({ where: { id: session.taskId! } })

    const list = await read(me.id)

    expect(await statusOf(request.id)).toBe('handled')
    expect(await statusOf(waiting.id)).toBe('handled')
    // Listed once, by its latest notice.
    expect(list.map(n => [n.id, n.status])).toEqual([[waiting.id, 'handled']])
  })
})
