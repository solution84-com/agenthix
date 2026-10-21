import { prisma } from 'wasp/server'

export const DEVICE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** A session's expiry moves forward at most this often, so a busy phone does not write on every request. */
export const SLIDE_INTERVAL_MS = 60 * 60 * 1000
const DEVICE_NAME_MAX = 60

export function cleanDeviceName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, DEVICE_NAME_MAX) : ''
  return name || 'Phone'
}

/** Marks a Wasp session as a phone's. Wasp's session `userId` is the Auth row's; the phone's is the person's. */
export async function markPhoneSession(sessionId: string, userId: string, deviceName: unknown): Promise<void> {
  const now = new Date()
  await prisma.deviceSession.upsert({
    where: { sessionId },
    create: { sessionId, userId, kind: 'phone', deviceName: cleanDeviceName(deviceName), lastUsedAt: now },
    update: { deviceName: cleanDeviceName(deviceName) },
  })
}

// Sessions looked at in this process (a browser's included), so most requests skip the database altogether.
// Bounded, because the key is a token a client sends.
const touchedAt = new Map<string, number>()
const TOUCHED_CAP = 10_000

/**
 * Called for each authenticated request and socket connection. A phone session unused for 30 days lapses, so
 * use pushes its expiry to 30 days from now, once an hour at most. A session already past its expiry is left
 * alone: it has lapsed, and use must not bring it back.
 */
export async function slidePhoneSession(sessionId: string, now = Date.now()): Promise<boolean> {
  const last = touchedAt.get(sessionId)
  if (last !== undefined && now - last < SLIDE_INTERVAL_MS) return false
  if (touchedAt.size >= TOUCHED_CAP) touchedAt.clear()
  touchedAt.set(sessionId, now)
  const due = await prisma.deviceSession.updateMany({
    where: { sessionId, lastUsedAt: { lt: new Date(now - SLIDE_INTERVAL_MS) } },
    data: { lastUsedAt: new Date(now) },
  })
  if (due.count === 0) return false
  const slid = await prisma.session.updateMany({
    where: { id: sessionId, expiresAt: { gt: new Date(now) } },
    data: { expiresAt: new Date(now + DEVICE_SESSION_TTL_MS) },
  })
  return slid.count > 0
}

export function forgetSlidSessions(): void {
  touchedAt.clear()
}

export type PhoneRow = { sessionId: string; deviceName: string; lastUsedAt: Date; signedInAt: Date }

/** The phones signed in as this person. A row whose session has ended (password change, lapse) is dropped. */
export async function listPhones(userId: string): Promise<PhoneRow[]> {
  const rows = await prisma.deviceSession.findMany({
    where: { userId, kind: 'phone' },
    orderBy: { lastUsedAt: 'desc' },
  })
  if (rows.length === 0) return []
  const live = await prisma.session.findMany({
    where: { id: { in: rows.map(r => r.sessionId) }, expiresAt: { gt: new Date() } },
    select: { id: true },
  })
  const liveIds = new Set(live.map(s => s.id))
  const gone = rows.filter(r => !liveIds.has(r.sessionId)).map(r => r.sessionId)
  if (gone.length > 0) await prisma.deviceSession.deleteMany({ where: { sessionId: { in: gone } } })
  return rows
    .filter(r => liveIds.has(r.sessionId))
    .map(r => ({ sessionId: r.sessionId, deviceName: r.deviceName, lastUsedAt: r.lastUsedAt, signedInAt: r.createdAt }))
}

/** Ends one of this person's phone sessions at once. False when it is not theirs. */
export async function signOutPhone(userId: string, sessionId: string): Promise<boolean> {
  const row = await prisma.deviceSession.findUnique({ where: { sessionId } })
  if (!row || row.userId !== userId) return false
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { id: sessionId } }),
    prisma.deviceSession.deleteMany({ where: { sessionId } }),
  ])
  touchedAt.delete(sessionId)
  const io = (globalThis as { __wasp_io__?: { in(room: string): { disconnectSockets(close?: boolean): void } } }).__wasp_io__
  io?.in(deviceRoom(sessionId)).disconnectSockets(true)
  return true
}

export const deviceRoom = (sessionId: string) => `device:${sessionId}`

export function bearerSessionId(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return m ? m[1] : null
}
