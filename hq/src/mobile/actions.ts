import { HttpError, prisma } from 'wasp/server'
import type { GenerateMobileAuthToken, ExchangeMobileAuthToken } from 'wasp/server/operations'
import crypto from 'crypto'
import { DEVICE_SESSION_TTL_MS, cleanDeviceName } from './deviceSessions'
import type { ExchangeMobileAuthTokenArgs, ExchangeMobileAuthTokenResult } from '@agenthix/core'

const TOKEN_TTL_MS = 5 * 60 * 1000

// The token is a credential for a session until it is spent, so only its
// SHA-256 is stored; the value is returned once, to the person who asked.
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export const generateMobileAuthToken: GenerateMobileAuthToken<void, { token: string }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)

  // Clean up expired tokens for this user before creating a new one
  await context.entities.MobileAuthToken.deleteMany({
    where: { userId: context.user.id, expiresAt: { lt: new Date() } },
  })

  const token = crypto.randomBytes(32).toString('base64url')
  await context.entities.MobileAuthToken.create({
    data: {
      token: hashToken(token),
      userId: context.user.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  })

  return { token }
}

export const exchangeMobileAuthToken: ExchangeMobileAuthToken<ExchangeMobileAuthTokenArgs, ExchangeMobileAuthTokenResult> = async (args, context) => {
  if (typeof args?.token !== 'string' || args.token === '') throw new HttpError(400, 'A pairing token is required')
  const tokenHash = hashToken(args.token)
  // Atomically mark the token consumed — prevents TOCTOU double-spend
  const updated = await context.entities.MobileAuthToken.updateMany({
    where: { token: tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  })

  if (updated.count === 0) {
    const record = await context.entities.MobileAuthToken.findUnique({
      where: { token: tokenHash },
    })
    if (!record) throw new HttpError(404, 'Invalid token')
    if (record.usedAt) throw new HttpError(400, 'Token already used')
    throw new HttpError(400, 'Token expired')
  }

  const record = await context.entities.MobileAuthToken.findUniqueOrThrow({
    where: { token: tokenHash },
  })

  if (record.expiresAt < new Date()) throw new HttpError(400, 'Token expired')

  const auth = await prisma.auth.findUniqueOrThrow({
    where: { userId: record.userId },
  })

  const sessionId = crypto.randomBytes(32).toString('hex')
  await prisma.$transaction([
    prisma.session.create({
      data: { id: sessionId, expiresAt: new Date(Date.now() + DEVICE_SESSION_TTL_MS), userId: auth.id },
    }),
    // Told apart from a browser's session, so it slides forward with use and can be signed out from Settings.
    prisma.deviceSession.create({
      data: { sessionId, userId: record.userId, kind: 'phone', deviceName: cleanDeviceName(args.deviceName) },
    }),
  ])

  return { sessionId }
}
