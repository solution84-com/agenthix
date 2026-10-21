import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  deviceSession: { updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  session: { updateMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}))
vi.mock('wasp/server', () => ({ prisma: db }))

import {
  cleanDeviceName, slidePhoneSession, forgetSlidSessions, signOutPhone, bearerSessionId,
  DEVICE_SESSION_TTL_MS, SLIDE_INTERVAL_MS,
} from '../deviceSessions'

const DAY = 86_400_000

beforeEach(() => {
  vi.clearAllMocks()
  forgetSlidSessions()
  db.deviceSession.updateMany.mockResolvedValue({ count: 1 })
  db.session.updateMany.mockResolvedValue({ count: 1 })
})

describe('a phone session slides forward with use @SC-1100', () => {
  it('moves the expiry to 30 days from now', async () => {
    const now = Date.UTC(2030, 0, 1)
    expect(await slidePhoneSession('s1', now)).toBe(true)
    const call = db.session.updateMany.mock.calls[0][0]
    expect(call.data.expiresAt.getTime()).toBe(now + 30 * DAY)
    expect(DEVICE_SESSION_TTL_MS).toBe(30 * DAY)
  })

  it('does not bring back a session that has already lapsed', async () => {
    const now = Date.UTC(2030, 0, 1)
    await slidePhoneSession('s1', now)
    expect(db.session.updateMany.mock.calls[0][0].where).toEqual({ id: 's1', expiresAt: { gt: new Date(now) } })
  })

  it('writes at most once an hour per session', async () => {
    const now = Date.UTC(2030, 0, 1)
    await slidePhoneSession('s1', now)
    await slidePhoneSession('s1', now + SLIDE_INTERVAL_MS - 1)
    expect(db.deviceSession.updateMany).toHaveBeenCalledTimes(1)
    await slidePhoneSession('s1', now + SLIDE_INTERVAL_MS)
    expect(db.deviceSession.updateMany).toHaveBeenCalledTimes(2)
  })

  it('leaves a session that is not a phone untouched', async () => {
    db.deviceSession.updateMany.mockResolvedValue({ count: 0 })
    expect(await slidePhoneSession('browser')).toBe(false)
    expect(db.session.updateMany).not.toHaveBeenCalled()
  })
})

describe('signing a phone out @SC-1101', () => {
  it('ends it, and closes its sockets', async () => {
    db.deviceSession.findUnique.mockResolvedValue({ sessionId: 's1', userId: 'u1' })
    const disconnectSockets = vi.fn()
    const inRoom = vi.fn(() => ({ disconnectSockets }))
    ;(globalThis as any).__wasp_io__ = { in: inRoom }
    expect(await signOutPhone('u1', 's1')).toBe(true)
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } })
    expect(inRoom).toHaveBeenCalledWith('device:s1')
    expect(disconnectSockets).toHaveBeenCalledWith(true)
    delete (globalThis as any).__wasp_io__
  })

  it("refuses another person's phone", async () => {
    db.deviceSession.findUnique.mockResolvedValue({ sessionId: 's1', userId: 'someone-else' })
    expect(await signOutPhone('u1', 's1')).toBe(false)
    expect(db.session.deleteMany).not.toHaveBeenCalled()
  })
})

describe('small helpers', () => {
  it('names a device, with a fallback', () => {
    expect(cleanDeviceName('  Sam\'s   phone ')).toBe("Sam's phone")
    expect(cleanDeviceName(undefined)).toBe('Phone')
    expect(cleanDeviceName('x'.repeat(200))).toHaveLength(60)
  })
  it('reads a bearer token', () => {
    expect(bearerSessionId('Bearer abc')).toBe('abc')
    expect(bearerSessionId('Basic abc')).toBeNull()
    expect(bearerSessionId(undefined)).toBeNull()
  })
})
