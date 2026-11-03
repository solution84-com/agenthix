import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { prisma } from '../../test/db'

// Sign-in attempts limited (getting-in spec, Signing in): 10 wrong passwords in
// 15 minutes from one address make it wait 15 minutes. The middleware in front
// of Wasp's login route, against the real RateLimit table.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

// The middleware gives a count back after the response has finished, without waiting for the write. Each
// write it starts is kept here, so an attempt waits for exactly that write rather than for a guess at its time.
const countsStarted = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('../../server/rateLimit', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/rateLimit')>()
  return {
    ...real,
    consumeRateLimit: (...args: Parameters<typeof real.consumeRateLimit>) => {
      const write = real.consumeRateLimit(...args)
      countsStarted.push(write)
      return write
    },
    giveBackRateLimit: (...args: Parameters<typeof real.giveBackRateLimit>) => {
      const write = real.giveBackRateLimit(...args)
      countsStarted.push(write)
      return write
    },
  }
})

import { SIGN_IN_LIMIT, TOO_MANY_SIGN_INS, isSignInRequest, signInLimit, signInLimitKey } from '../signInLimit'

/** One request through the middleware; `answer` is what Wasp's route would answer when it is let through. */
async function attempt(answer: number, ip = '9.9.9.9', url = '/auth/username/login') {
  class FakeResponse extends EventEmitter {
    statusCode = 200
    body: unknown = null
    status(code: number) { this.statusCode = code; return this }
    json(data: unknown) { this.body = data; this.emit('finish'); return this }
  }
  const res = new FakeResponse()
  const reachedRoute = await new Promise<boolean>((resolve) => {
    signInLimit({ method: 'POST', originalUrl: url, ip } as any, res as any, () => resolve(true))
    res.once('finish', () => resolve(false))
  })
  if (reachedRoute) {
    res.statusCode = answer
    res.emit('finish')
    await Promise.allSettled(countsStarted.splice(0))
  }
  return { reachedRoute, status: res.statusCode, body: res.body }
}

const counted = async (ip = '9.9.9.9') => (await prisma.rateLimit.findUnique({ where: { ip: signInLimitKey(ip) } }))?.count ?? 0

beforeEach(async () => { await prisma.rateLimit.deleteMany() })

describe('isSignInRequest @SC-713', () => {
  it('is only a POST to Wasp\'s username login route', () => {
    expect(isSignInRequest({ method: 'POST', originalUrl: '/auth/username/login' })).toBe(true)
    expect(isSignInRequest({ method: 'POST', originalUrl: '/auth/username/login?x=1' })).toBe(true)
    expect(isSignInRequest({ method: 'GET', originalUrl: '/auth/username/login' })).toBe(false)
    expect(isSignInRequest({ method: 'POST', originalUrl: '/auth/me' })).toBe(false)
  })
})

describe('signInLimit @SC-713', () => {
  it('counts each wrong password (401) and nothing else', async () => {
    await attempt(401)
    await attempt(200)
    await attempt(403)
    expect(await counted()).toBe(1)
  })

  it(`refuses the address after ${SIGN_IN_LIMIT} wrong passwords, even a right one, and no other address`, async () => {
    for (let i = 0; i < SIGN_IN_LIMIT; i++) await attempt(401)
    expect(await attempt(200)).toMatchObject({ reachedRoute: false, status: 429, body: { message: TOO_MANY_SIGN_INS } })
    expect((await attempt(200, '1.2.3.4')).reachedRoute).toBe(true)
  })

  it(`lets at most ${SIGN_IN_LIMIT} attempts sent at once reach the route`, async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => attempt(401)))
    expect(results.filter(r => r.reachedRoute)).toHaveLength(SIGN_IN_LIMIT)
  })

  it('lets every other request through untouched', async () => {
    expect((await attempt(401, '9.9.9.9', '/operations/get-me')).reachedRoute).toBe(true)
    expect(await counted()).toBe(0)
  })
})
