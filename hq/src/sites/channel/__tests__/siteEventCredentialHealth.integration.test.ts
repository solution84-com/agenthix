/**
 * `site.credentialHealth` intake (siteEventHandler.ts, SC-349) against the real
 * test database: a site saying an agent's credential is missing or expired
 * becomes one notification per admin, once per site, agent and state a day —
 * and every wire-controlled field is checked before it reaches a notification.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import type { CredentialHealthEvent } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUser, createUserWithRole } from '../../../test/factories'

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
let admins: Array<{ id: string }>

beforeEach(async () => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await siteNamed('site-1', 'Build box')
  admins = [await createUserWithRole('ADMIN'), await createUserWithRole('ADMIN')]
  await createUserWithRole('MEMBER')
  await createUser()
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

  it('creates one notification per admin, and none for anyone else, on the first event for a (site, agent, state) today', async () => {
    await report(healthEvent())

    const rows = await notifications()
    expect(rows.map((n) => n.userId).sort()).toEqual(admins.map((a) => a.id).sort())
    expect(rows[0]).toMatchObject({
      type: 'credential_health',
      title: 'Credential missing on Build box — @bot',
      actionUrl: '/admin/where-work-runs',
    })
    expect(rows[0].body).toContain('no key on file')
  })

  it('a second event for the same (site, agent, state) later the same day creates no further notification', async () => {
    await report(healthEvent())
    await report(healthEvent())
    expect(await prisma.notification.count()).toBe(2)
  })

  it('a different state, or a different agent, for the same site is a distinct key, not swallowed by the first', async () => {
    await report(healthEvent({ state: 'missing' }))
    await report(healthEvent({ state: 'expired' }))
    await report(healthEvent({ agentHandle: 'other-bot' }))
    expect(await prisma.notification.count()).toBe(6)
  })

  it('the dedup is scoped to this notification type and to today', async () => {
    const title = 'Credential missing on Build box — @bot'
    // Another kind of notification with the same title, and yesterday's of this kind.
    await prisma.notification.create({ data: { userId: admins[0].id, type: 'task_waiting', title, body: '' } })
    await prisma.notification.create({
      data: { userId: admins[0].id, type: 'credential_health', title, body: '', createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000) },
    })

    await report(healthEvent())

    expect(await prisma.notification.count({ where: { type: 'credential_health' } })).toBe(3)
  })

  // A site is untrusted network input: it could smuggle unbounded text into a
  // notification, or vary the handle on every event to defeat the daily dedup.
  describe('validates wire-controlled fields before they reach a notification', () => {
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

    it('a well-formed event still notifies exactly as before', async () => {
      await report(healthEvent({ agentHandle: 'my-agent_1' }))
      expect(await prisma.notification.count()).toBe(2)
    })

    it('truncates an oversized detail to 500 characters before it reaches the body — never rejects on this alone', async () => {
      await report(healthEvent({ detail: 'x'.repeat(2_000) }))

      const [first] = await notifications()
      expect(first.body).toContain('x'.repeat(500))
      expect(first.body).not.toContain('x'.repeat(501))
    })
  })
})
