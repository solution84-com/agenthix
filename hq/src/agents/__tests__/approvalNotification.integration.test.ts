/**
 * Telling the person a task is done on behalf of that its agent asked for a tool it is not allowed (adr-0089),
 * against the real database: one notification, linking to the task, its summary bounded; nobody when that
 * person is gone; and never a failure for the request it reports.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { notifyApprovalWaiting, TOOL_APPROVAL_NOTIFICATION_TYPE } from '../approvalNotification'

async function taskFor(person: { id: string }) {
  const project = await createProject({ name: 'Web', key: 'WEB' })
  const agent = await createAgent({ handle: 'atlas' })
  const task = await createTestTask({ data: { title: 'Ship it', projectId: project.id, number: 7, onBehalfOfUserId: person.id } })
  return { agent, task }
}

describe('notifyApprovalWaiting (adr-0089) @SC-474 @SC-521', () => {
  it('notifies the person the task is done on behalf of, linking to the task', async () => {
    const person = await createUser()
    const { agent, task } = await taskFor(person)

    await notifyApprovalWaiting(task.id, agent.id, 'needs web_fetch')

    expect(await prisma.notification.findMany({ where: { userId: person.id } })).toEqual([expect.objectContaining({
      type: TOOL_APPROVAL_NOTIFICATION_TYPE,
      title: 'Approval needed on WEB-7',
      body: '@atlas asked to use tools it is not allowed while working on "Ship it" on your behalf. needs web_fetch',
      actionLabel: 'Review the request',
      actionUrl: '/tasks/WEB-7',
      status: 'unread',
    })])
  })

  it('notifies the person who started the run instead, when one did (every-screen-reviewed spec §9)', async () => {
    const person = await createUser()
    const starter = await createUser()
    const { agent, task } = await taskFor(person)
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })

    await notifyApprovalWaiting(task.id, agent.id, null)

    expect(await prisma.notification.count({ where: { userId: starter.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: person.id } })).toBe(0)
  })

  it('notifies the person named for the run when the task does not hold it (a message into its session)', async () => {
    const person = await createUser()
    const sender = await createUser()
    const { agent, task } = await taskFor(person)

    await notifyApprovalWaiting(task.id, agent.id, null, sender.id)

    expect(await prisma.notification.count({ where: { userId: sender.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: person.id } })).toBe(0)
  })

  it('bounds a long summary from the site', async () => {
    const person = await createUser()
    const { agent, task } = await taskFor(person)
    await notifyApprovalWaiting(task.id, agent.id, 'x'.repeat(5000))
    const [note] = await prisma.notification.findMany({ where: { userId: person.id } })
    expect(note.body.length).toBeLessThan(500)
  })

  it('notifies nobody when the person has been removed', async () => {
    const person = await createUser()
    const { agent, task } = await taskFor(person)
    await prisma.task.update({ where: { id: task.id }, data: { onBehalfOfUserId: 'removed-person' } })
    await notifyApprovalWaiting(task.id, agent.id, null)
    expect(await prisma.notification.count()).toBe(0)
  })

  it('never throws — the approval request itself already stands', async () => {
    const person = await createUser()
    const { agent, task } = await taskFor(person)
    const create = vi.spyOn(prisma.notification, 'create').mockRejectedValueOnce(new Error('db down'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(notifyApprovalWaiting(task.id, agent.id, null)).resolves.toBeUndefined()
    } finally {
      create.mockRestore()
      errorLog.mockRestore()
    }
  })
})
