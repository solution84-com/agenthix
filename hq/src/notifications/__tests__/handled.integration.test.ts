/**
 * A task's waiting notifications clear themselves (every screen reviewed spec
 * §6), against the real test database: when its run moves on or anyone answers
 * its request, its requests and "needs you" notices — whoever they went to —
 * move to Earlier, and nothing else does.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { markTaskNotificationsHandled } from '../handled'

let number = 100

async function setup() {
  const ana = await createUser()
  const avery = await createUser()
  const project = await createProject({ accessLevel: 'OPEN' })
  const task = await createTestTask({ data: { title: 'Fix the checkout redirect', projectId: project.id, number: ++number, onBehalfOfUserId: ana.id } as any })
  const other = await createTestTask({ data: { title: 'Another', projectId: project.id, number: ++number, onBehalfOfUserId: ana.id } as any })
  const url = (t: { number: number }) => `/tasks/${project.key}-${t.number}`
  const note = (userId: string, type: string, actionUrl: string, status = 'unread') =>
    prisma.notification.create({ data: { userId, type, title: 't', body: 'b', actionUrl, status } })
  return { ana, avery, task, other, url, note }
}

const statusOf = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).status

describe('markTaskNotificationsHandled @SC-527', () => {
  it("moves the task's requests and waiting notices to handled, for everyone they went to, seen or not", async () => {
    const { ana, avery, task, url, note } = await setup()
    const request = await note(ana.id, 'tool_approval', url(task))
    const seenRequest = await note(avery.id, 'tool_approval', url(task), 'read')
    const waiting = await note(ana.id, 'task_waiting', url(task))

    await markTaskNotificationsHandled(task.id)

    expect(await statusOf(request.id)).toBe('handled')
    expect(await statusOf(seenRequest.id)).toBe('handled')
    expect(await statusOf(waiting.id)).toBe('handled')
  })

  it("leaves another task's notifications, other kinds, and dismissed ones as they are", async () => {
    const { ana, task, other, url, note } = await setup()
    const elsewhere = await note(ana.id, 'tool_approval', url(other))
    const setupNote = await note(ana.id, 'credential_health', url(task))
    const dismissed = await note(ana.id, 'task_waiting', url(task), 'dismissed')

    await markTaskNotificationsHandled(task.id)

    expect(await statusOf(elsewhere.id)).toBe('unread')
    expect(await statusOf(setupNote.id)).toBe('unread')
    expect(await statusOf(dismissed.id)).toBe('dismissed')
  })

  it('does nothing, and does not throw, for a task that does not exist', async () => {
    await expect(markTaskNotificationsHandled('no-such-task')).resolves.toBeUndefined()
  })
})
