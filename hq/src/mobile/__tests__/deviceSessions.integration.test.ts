import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

// A phone's session is marked at pairing, slides forward with use, is listed for its person and signed out
// from Settings. Against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { exchangeMobileAuthToken, generateMobileAuthToken } from '../actions'
import { forgetSlidSessions, listPhones, signOutPhone, slidePhoneSession, SLIDE_INTERVAL_MS } from '../deviceSessions'

const ctx = (user?: { id: string }) => ({ user, entities: { MobileAuthToken: prisma.mobileAuthToken } }) as any

async function pairedPhone(deviceName?: string) {
  const user = await createUser()
  await prisma.auth.create({ data: { userId: user.id } })
  const { token } = await generateMobileAuthToken(undefined as any, ctx(user))
  const { sessionId } = await exchangeMobileAuthToken({ token, deviceName }, ctx())
  return { user, sessionId }
}

describe('a paired phone', () => {
  it('is marked as a phone with the name it gave, and listed for its person only @SC-1100 @SC-1101', async () => {
    const { user, sessionId } = await pairedPhone("Sam's phone")
    const other = await pairedPhone()
    expect((await listPhones(user.id)).map(p => [p.sessionId, p.deviceName])).toEqual([[sessionId, "Sam's phone"]])
    expect((await listPhones(other.user.id))[0].deviceName).toBe('Phone')
  })

  it('slides its expiry forward after an hour of being used, and not before @SC-1100', async () => {
    const { sessionId } = await pairedPhone()
    forgetSlidSessions()
    const created = await prisma.deviceSession.findUniqueOrThrow({ where: { sessionId } })
    const soon = created.lastUsedAt.getTime() + 60_000
    expect(await slidePhoneSession(sessionId, soon)).toBe(false)
    forgetSlidSessions()
    const later = created.lastUsedAt.getTime() + SLIDE_INTERVAL_MS + 1
    expect(await slidePhoneSession(sessionId, later)).toBe(true)
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
    expect(session.expiresAt.getTime()).toBe(later + 30 * 86_400_000)
  })

  it('does not come back once it has lapsed @SC-1100', async () => {
    const { sessionId } = await pairedPhone()
    forgetSlidSessions()
    await prisma.session.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await prisma.deviceSession.update({ where: { sessionId }, data: { lastUsedAt: new Date(Date.now() - 2 * SLIDE_INTERVAL_MS) } })
    expect(await slidePhoneSession(sessionId)).toBe(false)
  })

  it('is signed out by its person at once, and by no one else @SC-1101', async () => {
    const { user, sessionId } = await pairedPhone()
    const stranger = await createUser()
    expect(await signOutPhone(stranger.id, sessionId)).toBe(false)
    expect(await prisma.session.findUnique({ where: { id: sessionId } })).not.toBeNull()
    expect(await signOutPhone(user.id, sessionId)).toBe(true)
    expect(await prisma.session.findUnique({ where: { id: sessionId } })).toBeNull()
    expect(await listPhones(user.id)).toEqual([])
  })
})
