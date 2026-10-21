/**
 * What the Fleet Console reads of hq for a fleet admin (`activity.list`, `notices.list`, `notices.dismiss`,
 * `account.find`; host-management spec §7, §10), against the real test database.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { FLEET_ACTIVITY_PAGE } from '@agenthix/core'
import { FLEET_MACHINE_NOTIFICATION_TYPES } from '../../notifications/notificationKinds'
import { recordActivity } from '../activity'
import { FLEET_ACTIVITY_NOTIFICATION } from '../fleetNoticeKinds'
import { activityPage, dismissFleetNotice, findAccount, fleetNotices } from '../fleetRecord'

async function account(username: string, role: 'ADMIN' | 'MEMBER', data: Record<string, unknown> = {}) {
  const user = await createUserWithRole(role, { displayName: username[0].toUpperCase() + username.slice(1), ...data })
  await prisma.auth.create({ data: { userId: user.id, identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } } })
  return user
}

describe('activity.list @SC-922', () => {
  it('gives the record newest first, a page at a time, with who did each', async () => {
    const sam = await account('sam', 'MEMBER', { fleetAdmin: true })
    const base = Date.now() - 60_000
    for (let i = 0; i < FLEET_ACTIVITY_PAGE + 2; i++) {
      await prisma.fleetActivity.create({ data: { byUserId: i === 0 ? null : sam.id, action: 'signedIn', subject: `entry ${i}`, at: new Date(base + i) } })
    }
    const first = await activityPage(sam.id)
    expect(first.entries).toHaveLength(FLEET_ACTIVITY_PAGE)
    expect(first.entries[0]).toMatchObject({ subject: `entry ${FLEET_ACTIVITY_PAGE + 1}`, by: { id: sam.id, name: 'Sam' }, action: 'signedIn' })
    expect(first.next).not.toBeNull()
    const second = await activityPage(sam.id, first.next!)
    expect(second.entries.map(e => e.subject)).toEqual(['entry 1', 'entry 0'])
    expect(second.entries[1].by).toBeNull()
    expect(second.next).toBeNull()
  })

  it('leaves out what is older than a year, and writing a new entry removes it', async () => {
    const sam = await account('sam', 'MEMBER', { fleetAdmin: true })
    await prisma.fleetActivity.create({ data: { byUserId: sam.id, action: 'signedIn', subject: 'long ago', at: new Date(Date.now() - 400 * 86400_000) } })
    expect((await activityPage(sam.id)).entries).toEqual([])
    await recordActivity({ byUserId: sam.id, action: 'signedOut', subject: 'now', at: new Date(), announce: false })
    expect(await prisma.fleetActivity.findMany({ select: { subject: true } })).toEqual([{ subject: 'now' }])
  })

  it('is refused for someone who does not hold the role', async () => {
    const robin = await account('robin', 'ADMIN')
    await expect(activityPage(robin.id)).rejects.toMatchObject({ code: 'not_allowed' })
  })
})

describe('notices.list and notices.dismiss @SC-922', () => {
  it('give a fleet admin their open notices about the fleet, and nothing else of theirs', async () => {
    const sam = await account('sam', 'ADMIN', { fleetAdmin: true })
    const robin = await account('robin', 'MEMBER', { fleetAdmin: true })
    const mine = (type: string, data: Record<string, unknown> = {}) =>
      prisma.notification.create({ data: { userId: sam.id, type, title: type, body: 'b', ...data } })
    await mine(FLEET_MACHINE_NOTIFICATION_TYPES.notHeardFrom, { subjectKey: 'h1', dismissible: false })
    await mine(FLEET_ACTIVITY_NOTIFICATION)
    await mine(FLEET_ACTIVITY_NOTIFICATION, { status: 'dismissed' })
    await mine('tool_approval')
    await prisma.notification.create({ data: { userId: robin.id, type: FLEET_ACTIVITY_NOTIFICATION, title: 'robin’s', body: 'b' } })
    const { notices } = await fleetNotices(sam.id)
    expect(notices.map(n => [n.kind, n.hostId]).sort()).toEqual([['activity', null], ['machineNotHeardFrom', 'h1']])
  })

  it('puts one away in hq too, refuses one that clears itself, and touches no one else’s', async () => {
    const sam = await account('sam', 'MEMBER', { fleetAdmin: true })
    const robin = await account('robin', 'MEMBER', { fleetAdmin: true })
    const told = await prisma.notification.create({ data: { userId: sam.id, type: FLEET_ACTIVITY_NOTIFICATION, title: 't', body: 'b' } })
    const machine = await prisma.notification.create({ data: { userId: sam.id, type: FLEET_MACHINE_NOTIFICATION_TYPES.left, title: 't', body: 'b', subjectKey: 'h1', dismissible: false } })
    expect(await dismissFleetNotice(robin.id, told.id)).toEqual({ dismissed: false })
    await expect(dismissFleetNotice(sam.id, machine.id)).rejects.toMatchObject({ code: 'not_allowed' })
    expect(await dismissFleetNotice(sam.id, told.id)).toEqual({ dismissed: true })
    expect(await prisma.notification.findUnique({ where: { id: told.id } })).toMatchObject({ status: 'dismissed' })
    expect(await dismissFleetNotice(sam.id, told.id)).toEqual({ dismissed: false })
  })

  it('are refused for someone who does not hold the role', async () => {
    const robin = await account('robin', 'ADMIN')
    await expect(fleetNotices(robin.id)).rejects.toMatchObject({ code: 'not_allowed' })
  })
})

describe('account.find @SC-922', () => {
  it('finds an account by its exact username, with its roles', async () => {
    const sam = await account('sam', 'MEMBER', { fleetAdmin: true })
    const jordan = await account('jordan', 'ADMIN')
    expect(await findAccount(sam.id, 'jordan')).toEqual({
      account: { id: jordan.id, name: 'Jordan', username: 'jordan', organisationAdmin: true, fleetAdmin: false },
    })
    expect(await findAccount(sam.id, 'jor')).toEqual({ account: null })
  })

  it('finds no one who has left', async () => {
    const sam = await account('sam', 'MEMBER', { fleetAdmin: true })
    await account('gone', 'MEMBER', { deactivatedAt: new Date() })
    expect(await findAccount(sam.id, 'gone')).toEqual({ account: null })
  })

  it('is refused for someone who does not hold the role', async () => {
    const robin = await account('robin', 'ADMIN')
    await expect(findAccount(robin.id, 'robin')).rejects.toMatchObject({ code: 'not_allowed' })
  })
})
