import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { clearPersistentNotification, raisePersistentNotification, syncPersistentNotifications } from '../persistent'
import { dismissNotification } from '../actions'
import { getNotifications } from '../queries'

// Persistent notifications, a kind any feature may raise (every screen reviewed spec §6), against the real database.

const ctx = (user?: { id: string }) => ({ user, entities: { Notification: prisma.notification } }) as any
const TYPE = 'site_upgrade'
const notice = { type: TYPE, subjectKey: 'site-1', title: 'Old server needs upgrading', body: 'It runs protocol 16.2.', actionUrl: '/org/settings/where-work-runs' }
const rows = (userId?: string) => prisma.notification.findMany({ where: { type: TYPE, ...(userId ? { userId } : {}) }, orderBy: { createdAt: 'asc' } })

describe('raising a persistent notification @SC-628', () => {
  it('raises one for each person, under Needs you, not dismissible unless its kind says so', async () => {
    const [a, b] = [await createUser(), await createUser()]
    await raisePersistentNotification([a.id, b.id], notice)

    expect(await rows()).toHaveLength(2)
    const [item] = await getNotifications(undefined as any, ctx(a))
    expect(item).toMatchObject({ type: TYPE, title: notice.title, status: 'unread', dismissible: false, detail: notice.body })
  })

  it('never makes a second open one for the same subject: raising again updates it', async () => {
    const me = await createUser()
    await raisePersistentNotification([me.id], notice)
    await prisma.notification.updateMany({ data: { status: 'read' } })
    await Promise.all([
      raisePersistentNotification([me.id], { ...notice, body: 'It runs protocol 16.3.' }),
      raisePersistentNotification([me.id], { ...notice, body: 'It runs protocol 16.3.' }),
    ])

    const list = await rows(me.id)
    expect(list).toHaveLength(1)
    // A changed line 2 is not news: it stays seen.
    expect(list[0]).toMatchObject({ body: 'It runs protocol 16.3.', status: 'read' })
  })

  it('counts again on the bell when its title changes', async () => {
    const me = await createUser()
    await raisePersistentNotification([me.id], notice)
    await prisma.notification.updateMany({ data: { status: 'read' } })
    await raisePersistentNotification([me.id], { ...notice, title: '2 machines are asking to connect' })
    expect((await rows(me.id))[0].status).toBe('unread')
  })

  it('clears itself when its subject is addressed, and the same one reopens, as new, if the problem returns', async () => {
    const me = await createUser()
    await raisePersistentNotification([me.id], notice)
    const [first] = await rows(me.id)
    expect(await clearPersistentNotification(TYPE, 'site-1')).toBe(1)
    expect((await rows(me.id)).map(r => r.status)).toEqual(['handled'])

    await raisePersistentNotification([me.id], { ...notice, body: 'It runs protocol 16.3.' })
    const after = await rows(me.id)
    expect(after.map(r => [r.id, r.status, r.body])).toEqual([[first.id, 'unread', 'It runs protocol 16.3.']])
    // Back at the top of Needs you, as of now.
    expect(after[0].createdAt.getTime()).toBeGreaterThan(first.createdAt.getTime())
  })

  it('clears every subject under a prefix', async () => {
    const me = await createUser()
    await raisePersistentNotification([me.id], { ...notice, subjectKey: 'm1:a' })
    await raisePersistentNotification([me.id], { ...notice, subjectKey: 'm1:b' })
    await raisePersistentNotification([me.id], { ...notice, subjectKey: 'm2:a' })
    expect(await clearPersistentNotification(TYPE, { startsWith: 'm1:' })).toBe(2)
    expect((await rows(me.id)).filter(r => r.status === 'unread').map(r => r.subjectKey)).toEqual(['m2:a'])
  })
})

describe('dismissing a persistent notification @SC-629', () => {
  it('refuses one that only its subject being addressed may clear', async () => {
    const me = await createUser()
    await raisePersistentNotification([me.id], notice)
    const [row] = await rows(me.id)
    await expect(dismissNotification({ id: row.id }, ctx(me))).rejects.toMatchObject({ statusCode: 409 })
    expect((await rows(me.id))[0].status).toBe('unread')
  })

  it('allows a dismissible one, which then stays dismissed for that subject', async () => {
    const me = await createUser()
    const expired = { ...notice, subjectKey: 'm1:req-1', dismissible: true }
    await raisePersistentNotification([me.id], expired)
    const [row] = await rows(me.id)
    await dismissNotification({ id: row.id }, ctx(me))
    await raisePersistentNotification([me.id], expired)

    expect((await rows(me.id)).map(r => r.status)).toEqual(['dismissed'])
    expect(await getNotifications(undefined as any, ctx(me))).toEqual([])
  })
})

describe('syncing one type @SC-628', () => {
  it('makes the open notifications exactly those given, for exactly those people', async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()]
    await raisePersistentNotification([a.id, b.id, c.id], notice)
    await raisePersistentNotification([a.id], { ...notice, subjectKey: 'site-2' })

    // site-2 is fixed, site-3 is new, and c is no longer among the people told.
    await syncPersistentNotifications(TYPE, [notice, { ...notice, subjectKey: 'site-3' }], [a.id, b.id])

    const open = await prisma.notification.findMany({ where: { type: TYPE, status: 'unread' }, select: { userId: true, subjectKey: true } })
    const key = (r: { userId: string; subjectKey: string | null }) => `${r.userId === a.id ? 'a' : r.userId === b.id ? 'b' : 'c'}:${r.subjectKey}`
    expect(open.map(key).sort()).toEqual(['a:site-1', 'a:site-3', 'b:site-1', 'b:site-3'])
  })
})
