/**
 * Needs attention for organisation admins (every screen reviewed spec §3),
 * against the real database: one list from the admin's own open
 * notifications, approvals gathered as one item; the persistent Bypassed
 * notice, acknowledged and returning when another agent is set to Bypassed;
 * invitations unanswered for a week; a team the built-in agent proposed.
 * Handling an item in either place clears it in both, since they are the same.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getNeedsAttention } from '../needsAttention'
import { acknowledgeBypassedAgents, dismissNotification } from '../actions'
import { getNotifications } from '../queries'
import { ORG_NOTIFICATION_TYPES as T } from '../notificationKinds'
import { SYSTEM_TEMPLATE_IDS } from '../../library/systemTemplates'

const ctx = (user?: { id: string }) => ({ user, entities: { Notification: prisma.notification } }) as any
const DAY = 24 * 60 * 60 * 1000

describe('getNeedsAttention @SC-666', () => {
  it('is for organisation admins only', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(getNeedsAttention(undefined, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getNeedsAttention(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('is empty when nothing needs them', async () => {
    const admin = await createUserWithRole('ADMIN')
    expect(await getNeedsAttention(undefined, ctx(admin))).toEqual([])
  })

  it("lists the admin's open site and model-access notices as infrastructure, and gathers their approvals as one item", async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.notification.createMany({ data: [
      { userId: admin.id, type: 'site_health', subjectKey: 's1', title: 'Build server: disk nearly full', body: '6 GB free', dismissible: false },
      { userId: admin.id, type: 'credential_health', title: 'Model access failing', body: 'The key was rejected' },
      { userId: admin.id, type: 'tool_approval', title: 'Wants to run', body: '', actionUrl: '/tasks/WEB-1' },
      { userId: admin.id, type: 'tool_approval', title: 'Wants to run', body: '', actionUrl: '/tasks/WEB-2' },
      { userId: admin.id, type: 'task_waiting', title: 'Your task needs you', body: '', actionUrl: '/tasks/WEB-3' },
      { userId: admin.id, type: 'site_health', subjectKey: 's2', title: 'Handled already', body: '', status: 'handled' },
    ] })

    const items = await getNeedsAttention(undefined, ctx(admin))

    expect(items.map(i => [i.type, i.area])).toEqual([
      ['site_health', 'infrastructure'], ['credential_health', 'infrastructure'], ['tool_approval', 'workplace'],
    ])
    expect(items[2]).toMatchObject({ key: 'approvals', title: '2 approvals waiting', actionUrl: '/runs' })
    expect(items[2].notificationIds).toHaveLength(2)
  })
})

describe('the agents with approval Bypassed @SC-667', () => {
  it('is one persistent item naming them, for admins only, and an admin may acknowledge it', async () => {
    const admin = await createUserWithRole('ADMIN')
    const otherAdmin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await prisma.org.create({ data: { name: 'Acme' } })
    const bot = await createAgent({ name: 'Release bot', approval: 'bypassed' })
    await createAgent({ name: 'Data analyst', approval: 'bypassed' })
    await createAgent({ name: 'Writer', approval: 'deferred' })

    const [item] = await getNeedsAttention(undefined, ctx(admin))
    expect(item).toMatchObject({
      type: T.bypassed, title: '2 agents run with approval Bypassed', acknowledgeable: true, dismissible: false,
      body: expect.stringContaining('Data analyst and Release bot'),
    })
    expect(await prisma.notification.count({ where: { type: T.bypassed, userId: member.id } })).toBe(0)

    await acknowledgeBypassedAgents(undefined, ctx(admin))

    expect(await getNeedsAttention(undefined, ctx(admin))).toEqual([])
    expect(await getNeedsAttention(undefined, ctx(otherAdmin))).toEqual([])
    expect((await prisma.org.findFirstOrThrow()).acknowledgedBypassedAgentIds).toContain(bot.id)
  })

  it('returns when another agent is set to Bypassed, and not when one stops being Bypassed', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme' } })
    const bot = await createAgent({ name: 'Release bot', approval: 'bypassed' })
    const analyst = await createAgent({ name: 'Data analyst', approval: 'bypassed' })
    await acknowledgeBypassedAgents(undefined, ctx(admin))

    await prisma.agent.update({ where: { id: analyst.id }, data: { approval: 'deferred' } })
    expect(await getNeedsAttention(undefined, ctx(admin))).toEqual([])

    await createAgent({ name: 'Scraper', approval: 'bypassed' })
    const [item] = await getNeedsAttention(undefined, ctx(admin))
    expect(item).toMatchObject({ type: T.bypassed, title: '2 agents run with approval Bypassed' })
    expect(item.body).toContain(bot.name)

    // Set to Bypassed again after it stopped, an agent counts as another.
    await acknowledgeBypassedAgents(undefined, ctx(admin))
    await prisma.agent.update({ where: { id: analyst.id }, data: { approval: 'bypassed' } })
    expect((await getNeedsAttention(undefined, ctx(admin))).map(i => i.type)).toEqual([T.bypassed])
  })

  it('putting it away from Notifications acknowledges it too, since it is the same item', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme' } })
    await createAgent({ name: 'Release bot', approval: 'bypassed' })

    const listed = await getNotifications(undefined as any, ctx(admin))
    const notice = listed.find(n => n.type === T.bypassed)!
    await dismissNotification({ id: notice.id }, ctx(admin))

    expect(await getNeedsAttention(undefined, ctx(admin))).toEqual([])
  })

  it('refuses a member acknowledging it', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(acknowledgeBypassedAgents(undefined, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('invitations unanswered for a week @SC-666', () => {
  it('is one item saying who they are for, and clears once they are answered', async () => {
    const admin = await createUserWithRole('ADMIN')
    const old = new Date(Date.now() - 8 * DAY)
    const ana = await prisma.invite.create({ data: { tokenHash: 'h1', note: 'Ana', createdBy: admin.id, createdAt: old } })
    await prisma.invite.create({ data: { tokenHash: 'h2', note: 'Lee', createdBy: admin.id, createdAt: old } })
    await prisma.invite.create({ data: { tokenHash: 'h3', note: 'New', createdBy: admin.id } })

    const [item] = await getNeedsAttention(undefined, ctx(admin))
    expect(item).toMatchObject({ type: T.invitations, title: '2 invitations unanswered', body: expect.stringContaining('Ana and Lee') })

    await prisma.invite.updateMany({ data: { revokedAt: new Date() } })
    expect(await getNeedsAttention(undefined, ctx(admin))).toEqual([])
    expect(await prisma.notification.count({ where: { type: T.invitations, status: 'handled' } })).toBe(1)
    void ana
  })
})

describe('a team the built-in agent proposed @SC-666', () => {
  it('is a notification for admins in place of the banner, and clears once confirmed', async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject()
    await prisma.boardTemplate.upsert({
      where: { id: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY },
      create: { id: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY, name: 'Assembly', assetPath: 'x', isSystem: true },
      update: {},
    })
    const board = await prisma.board.create({ data: { name: 'Assembly', projectId: project.id, templateId: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY } })
    const task = await prisma.task.create({ data: {
      title: 'Proposed: Solo Developer', projectId: project.id, boardId: board.id, column: 'in_review', number: 1,
      onBehalfOfUserId: (await createUser()).id, applicationData: { templateId: 'wft-solo-dev' },
    } })

    const [item] = await getNeedsAttention(undefined, ctx(admin))
    expect(item).toMatchObject({
      type: T.teamProposed,
      title: 'The built-in agent proposed a team: Solo Developer',
      actionUrl: `/workforce-templates/review?taskId=${task.id}&templateId=wft-solo-dev`,
    })

    await prisma.task.update({ where: { id: task.id }, data: { column: 'done', status: 'DONE' } })
    expect(await getNeedsAttention(undefined, ctx(admin))).toEqual([])
  })
})
