import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `agenthix-site unregister` says what is true: what hq answered, and that hq's own site cannot leave.

const db = vi.hoisted(() => ({
  config: { siteId: 'site-uuid', name: 'Build box' } as any,
  link: null as any,
}))
vi.mock('#db', () => ({
  prisma: {
    siteConfig: { findFirst: async () => db.config },
    hqConnection: {
      findFirst: async () => db.link,
      deleteMany: async () => { db.link = null },
    },
  },
}))
const manager = vi.hoisted(() => ({ stop: vi.fn(), restart: vi.fn() }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: manager }))

import { unregister, DEFAULT_SITE_CANNOT_LEAVE } from '../leave'
import { sealConnectionToken } from '../../hq/connectionToken'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')

const live = () => ({ status: 'ACTIVE', connectionToken: sealConnectionToken('smc_a_b'), hqUrl: 'https://hq.example.com' })
const answers = (status: number) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => ({}) }))

beforeEach(() => {
  vi.clearAllMocks()
  db.link = null
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('unregister @SC-849', () => {
  it('tells hq it is leaving, then forgets its credential', async () => {
    db.link = live()
    answers(200)
    expect(await unregister()).toEqual({ toldHq: true, hq: 'left' })
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url.toString()).toBe('https://hq.example.com/api/v1/sites/leave')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer smc_a_b', 'X-Site-Id': 'site-uuid' })
    expect(init).toMatchObject({ redirect: 'error' })
    expect(manager.stop).toHaveBeenCalled()
    expect(db.link).toBeNull()
  })

  it('says hq had already taken it out when hq no longer knows its credential', async () => {
    db.link = live()
    answers(401)
    expect(await unregister()).toEqual({ toldHq: false, hq: 'alreadyRemoved' })
    expect(db.link).toBeNull()
  })

  it('tells a refusal from hq apart from hq not being reached', async () => {
    db.link = live()
    answers(500)
    expect(await unregister()).toEqual({ toldHq: false, hq: 'failed' })
    db.link = live()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    expect(await unregister()).toEqual({ toldHq: false, hq: 'unreachable' })
    expect(db.link).toBeNull()
  })

  it('refuses for hq\'s own site when hq says it cannot leave, keeping its link', async () => {
    db.link = live()
    answers(409)
    await expect(unregister()).rejects.toThrow(DEFAULT_SITE_CANNOT_LEAVE)
    expect(db.link).not.toBeNull()
    expect(manager.stop).not.toHaveBeenCalled()
  })

  it('refuses for a site paired by its secret without asking hq or changing anything', async () => {
    vi.stubEnv('HQ_URL', 'http://ns-hq-web:4100')
    vi.stubEnv('HQ_PAIRING_SECRET', 's'.repeat(64))
    db.link = live()
    answers(200)
    await expect(unregister()).rejects.toThrow(/comes with HQ.*cannot leave HQ.*Nothing was changed/)
    expect(fetch).not.toHaveBeenCalled()
    expect(db.link).not.toBeNull()
  })

  it('says hq had already taken out a link it revoked, without asking again', async () => {
    db.link = { ...live(), status: 'REVOKED' }
    answers(200)
    expect(await unregister()).toEqual({ toldHq: false, hq: 'alreadyRemoved' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('with a credential stored in the clear, leaves without presenting it to hq', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.link = { status: 'ACTIVE', connectionToken: 'smc_plain', hqUrl: 'https://hq.example.com' }
    answers(200)
    expect(await unregister()).toEqual({ toldHq: false, hq: 'notAsked' })
    expect(fetch).not.toHaveBeenCalled()
    expect(db.link).toBeNull()
  })

  it('refuses when not registered', async () => {
    await expect(unregister()).rejects.toThrow(/not registered/)
  })
})
