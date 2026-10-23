/**
 * `site.credentialHealth` intake (siteEventHandler.ts, SC-349) against the real
 * test database: a site saying a run's Claude login is missing or expired tells
 * each person whose own Claude subscription has expired in hq's record, and
 * nobody else, once a day each — and every wire-controlled field is checked
 * before the event is acted on.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import type { CredentialHealthEvent } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUser, createUserWithRole } from '../../../test/factories'
import { createSubscription } from '../../../routing/__tests__/routingFixtures'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
// The real task runner registers itself on this handler as it loads, which would
// load it in the middle of loading the handler; it is not what these tests are about.
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { handleSiteEvent, __resetForTests } from '../siteEventHandler'
import { siteNamed } from './siteEventFixtures'

let warnSpy: MockInstance<typeof console.warn>
let expired: Array<{ id: string }>

/** A person's own subscription whose login expired an hour ago. */
async function expiredSubscription(userId: string) {
  const sub = await createSubscription(userId)
  await prisma.aiProvider.update({ where: { id: sub.id }, data: { expiresAt: new Date(Date.now() - 3_600_000) } })
}

beforeEach(async () => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await siteNamed('site-1', 'Build box')
  expired = [await createUserWithRole('MEMBER'), await createUser()]
  for (const person of expired) await expiredSubscription(person.id)
  await createUserWithRole('ADMIN')
  await createSubscription((await createUserWithRole('MEMBER')).id)
})

afterEach(() => {
  vi.restoreAllMocks()
  __resetForTests()
})

function healthEvent(overrides: Partial<CredentialHealthEvent> = {}): CredentialHealthEvent {
  return { agentHandle: 'bot', state: 'missing', detail: 'no key on file', ...overrides }
}
const report = (e: CredentialHealthEvent) => handleSiteEvent('site-1', 'site.credentialHealth', e)
const notifications = () => prisma.notification.findMany({ orderBy: { createdAt: 'asc' } })

describe('site event intake — site.credentialHealth @SC-343 @SC-349', () => {
  it('logs and resolves without throwing', async () => {
    await expect(report(healthEvent())).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('tells each person whose own subscription has expired, and nobody else: no admin, no one whose login is current', async () => {
    await report(healthEvent())

    const rows = await notifications()
    expect(rows.map((n) => n.userId).sort()).toEqual(expired.map((p) => p.id).sort())
    expect(rows[0]).toMatchObject({
      type: 'credential_health',
      title: 'Your Claude subscription needs signing in again',
      actionLabel: 'Sign in again',
      actionUrl: '/settings',
    })
  })

  it('tells each person once a day, whatever the agent or state the site reports', async () => {
    await report(healthEvent())
    await report(healthEvent({ state: 'expired' }))
    await report(healthEvent({ agentHandle: 'other-bot' }))
    expect(await prisma.notification.count()).toBe(2)
  })

  it('the once-a-day is scoped to this notification type and to today', async () => {
    const [first] = expired
    // Another kind of notification today, and yesterday's of this kind.
    await prisma.notification.create({ data: { userId: first.id, type: 'task_waiting', title: 'Something else', body: '' } })
    await prisma.notification.create({
      data: { userId: first.id, type: 'credential_health', title: 'Earlier', body: '', createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000) },
    })

    await report(healthEvent())

    expect(await prisma.notification.count({ where: { type: 'credential_health', userId: first.id } })).toBe(2)
  })

  // A site is untrusted network input: it could smuggle unbounded text into a
  // notification, or vary the handle on every event.
  describe('validates wire-controlled fields before the event is acted on', () => {
    it.each([
      // `as never`: outside the wire type on purpose.
      ['a state outside the known two values', healthEvent({ state: 'revoked' as never })],
      ['an oversized agentHandle', healthEvent({ agentHandle: 'a'.repeat(200) })],
      ['an agentHandle carrying injection-shaped characters', healthEvent({ agentHandle: 'bot"; DROP TABLE users; --' })],
      ['an agentHandle with uppercase letters, which the shared handle rule refuses', healthEvent({ agentHandle: 'MyAgent' })],
    ])('rejects %s — logs and creates no notification', async (_what, event) => {
      await report(event)
      expect(warnSpy).toHaveBeenCalled()
      expect(await prisma.notification.count()).toBe(0)
    })

    it('a well-formed event still tells each person', async () => {
      await report(healthEvent({ agentHandle: 'my-agent_1' }))
      expect(await prisma.notification.count()).toBe(2)
    })

    it('an oversized detail is no reason to reject, and none of the site\'s text reaches the notification', async () => {
      await report(healthEvent({ detail: 'x'.repeat(2_000) }))

      const rows = await notifications()
      expect(rows).toHaveLength(2)
      for (const row of rows) expect(`${row.title} ${row.body}`).not.toContain('x'.repeat(10))
    })
  })
})
