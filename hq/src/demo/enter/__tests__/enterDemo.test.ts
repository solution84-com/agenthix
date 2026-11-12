/** Enter the demo's caps, with the database replaced: the address it counts by, and the visitors it counts. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ keys: [] as string[], active: 0, seen: [] as string[], made: 0, tasksFor: [] as string[] }))

vi.mock('wasp/server', () => {
  const tx = {
    $executeRaw: async () => 0,
    rateLimit: {
      count: async () => db.active,
      upsert: async ({ where }: { where: { ip: string } }) => { db.seen.push(where.ip) },
    },
    user: { create: async () => { db.made += 1; return { id: `v${db.made}` } } },
    userSettings: { create: async () => ({}) },
  }
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      // The address's hour: 25 minutes and a little left of it.
      rateLimit: { findUnique: async () => ({ resetAt: new Date(Date.now() + 24 * 60_000 + 5_000) }) },
    },
  }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: async () => 'hashed' }))
vi.mock('../../../server/rateLimit', () => ({
  consumeRateLimit: async (key: string, rule: { max: number }) => {
    db.keys.push(key)
    return db.keys.filter(k => k === key).length <= rule.max
  },
}))
vi.mock('../../../projects/personalProject', () => ({ ensurePersonalProjectAfterSignup: async () => {} }))
vi.mock('../../../pictures/service', () => ({ applyDefaultPictures: async () => ({}) }))
// What a visitor is given of the sample is tested on its own (sampleShare.test.ts) and against the database.
vi.mock('../sampleShare', () => ({ shareTheSample: async () => ({ projects: 0, pins: 0 }) }))
vi.mock('../visitorTasks', () => ({ giveVisitorTasks: async (id: string) => { db.tasksFor.push(id); return 2 } }))
vi.mock('../../../cloud/cloudAccounts', () => ({ makeBrowserSession: async (id: string) => `s-${id}` }))

import { DEMO_FULL, enterDemo, MAX_VISITORS, tooManyFromAddress } from '../enterDemo'

beforeEach(() => {
  db.keys = []
  db.active = 0
  db.seen = []
  db.made = 0
  db.tasksFor = []
})

describe('Enter the demo', () => {
  it('lets 5 in an hour from one IPv6 /64, however many addresses it uses @SC-1950', async () => {
    for (let i = 1; i <= 5; i++) expect((await enterDemo(`2001:db8:1:2::${i}`)).ok).toBe(true)
    expect(await enterDemo('2001:db8:1:2::99')).toEqual({
      ok: false, status: 429, reason: 'address',
      error: 'Too many visitors from your network this hour. Try again in 25 minutes.',
    })
    expect((await enterDemo('2001:db8:1:3::1')).ok).toBe(true)
  })

  it('counts visitors active in the last hour, not every account made since the reset, and marks a new one active @SC-1950', async () => {
    db.active = MAX_VISITORS
    expect(await enterDemo('203.0.113.4')).toMatchObject({ ok: false, status: 503, reason: 'full', error: DEMO_FULL })
    db.active = MAX_VISITORS - 1
    expect(await enterDemo('203.0.113.4')).toEqual({ ok: true, sessionId: 's-v1' })
    expect(db.seen).toEqual(['demo-seen:v1'])
  })

  it('gives a new visitor their own tasks once their account is made, and none when the demo is full @SC-1952', async () => {
    db.active = MAX_VISITORS
    await enterDemo('203.0.113.4')
    expect(db.tasksFor).toEqual([])
    db.active = 0
    await enterDemo('203.0.113.5')
    expect(db.tasksFor).toEqual(['v1'])
  })
})

describe('the per-address refusal (walkthrough finding 9) @SC-1950', () => {
  it('says what it is, in whole minutes, never that the demo is full', () => {
    expect(tooManyFromAddress(1)).toBe('Too many visitors from your network this hour. Try again in 1 minute.')
    expect(tooManyFromAddress(42)).toBe('Too many visitors from your network this hour. Try again in 42 minutes.')
    expect(tooManyFromAddress(42)).not.toContain('full')
  })
})
