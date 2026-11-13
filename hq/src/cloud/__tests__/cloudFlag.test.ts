/**
 * Agenthix Cloud's server doors while its flag is off (adr-0189): signing in with an Agenthix account, the link and
 * unlink, and a site's ask for Cloud's AI token each answer 404 *not available* before they read or call anything.
 * The operations' own refusals are in the integration suite (cloudForMembers, cloudStores).
 */
import { describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'

const touched = vi.hoisted(() => [] as string[])
vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error { constructor(readonly statusCode: number, message?: string) { super(message) } },
  prisma: new Proxy({}, { get: (_t, model) => { touched.push(`prisma.${String(model)}`); throw new Error('no database here') } }),
}))
vi.mock('wasp/auth/password', () => ({ verifyPassword: async () => false }))
vi.mock('../../features/switches', async () => (await import('../../test/switchesWithoutDatabase')).switchesWithoutDatabase())
vi.mock('../../server/rateLimit', () => ({ consumeRateLimit: async () => true, giveBackRateLimit: async () => {} }))
vi.mock('../cloudAccounts', () => ({
  readOwnCloudLink: async () => { touched.push('readOwnCloudLink'); return null },
  unlinkCloudAccount: async () => { touched.push('unlinkCloudAccount'); return true },
}))
vi.mock('../index', () => ({
  cloudSignIn: () => ({ connected: async () => { touched.push('cloudSignIn'); return true } }),
  cloudConnection: () => { touched.push('cloudConnection'); return null },
}))
vi.mock('../../sites/registrationService', () => ({ authenticateSite: async () => { touched.push('authenticateSite'); return true } }))

import {
  cloudLinkHandler, cloudSignInStatusHandler, finishCloudSignInHandler, startCloudSignInHandler, unlinkCloudAccountHandler,
} from '../signInApi'
import { cloudAiTokenHandler } from '../../sites/cloudAiTokenApi'

type Handler = (req: never, res: never, context: never) => Promise<unknown> | unknown

function answered() {
  const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this }, json(b: unknown) { this.body = b; return this } }
  return res
}

const req = { ip: '127.0.0.1', body: { purpose: 'signIn' }, headers: { authorization: 'Bearer x', 'x-site-id': 'site-1' } }
const context = { user: { id: 'u-1' } }

const DOORS: Array<[string, Handler]> = [
  ['the sign-in status', cloudSignInStatusHandler as Handler],
  ['starting a sign-in', startCloudSignInHandler as Handler],
  ['finishing a sign-in', finishCloudSignInHandler as Handler],
  ['the person\'s link', cloudLinkHandler as Handler],
  ['unlinking', unlinkCloudAccountHandler as Handler],
  ['a site\'s ask for Cloud\'s AI token', cloudAiTokenHandler as Handler],
]

describe('Agenthix Cloud\'s server doors while its flag is off (adr-0189)', () => {
  for (const [name, handler] of DOORS) {
    it(`${name} refuses as not available, and reads or calls nothing`, async () => {
      touched.length = 0
      const res = answered()
      await expect(handler(req as never, res as never, context as never)).rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('not available') })
      expect(touched).toEqual([])
    })
  }
})

withFeature('cloud', () => {
  describe('Agenthix Cloud\'s server doors while its flag is on', () => {
    it('the sign-in status answers from the connection', async () => {
      const res = answered()
      await cloudSignInStatusHandler(req as never, res as never, context as never)
      expect(res.body).toEqual({ connected: true })
    })
  })
})
