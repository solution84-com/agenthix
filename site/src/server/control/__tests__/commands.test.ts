import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  config: { siteId: 'site-uuid', name: 'Build box' } as any,
  link: null as any,
}))
vi.mock('#db', () => ({
  prisma: {
    siteConfig: { findFirst: async () => db.config },
    hqConnection: {
      findFirst: async () => db.link,
    },
  },
}))
const manager = vi.hoisted(() => ({
  restart: vi.fn(), stop: vi.fn(),
  lastError: null as string | null, requiredProtocolVersion: null as string | null, problem: null as string | null,
  connectionState: vi.fn(() => 'disconnected'),
}))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: manager }))

import { readStatus } from '../commands'
import { setPairingProblem } from '../../hq/linkProblem'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')

beforeEach(() => {
  vi.clearAllMocks()
  db.link = null
  manager.restart.mockResolvedValue(undefined)
  manager.lastError = null
  manager.problem = null
})

describe('status', () => {
  it('reports a site that is not connected to an HQ', async () => {
    expect(await readStatus()).toEqual({ siteId: 'site-uuid', name: 'Build box', pairedBySecret: false, problem: null, hq: null, moving: null, replaced: null })
  })

  it('names why it is not connected, from the closed set', async () => {
    db.link = { hqUrl: 'https://hq.example.com', status: 'DEGRADED', connectedAt: null }
    manager.problem = 'unreachable'
    expect((await readStatus()).problem).toBe('unreachable')
  })

  it('says a link hq removed is refused, and nothing while connected', async () => {
    db.link = { hqUrl: 'https://hq.example.com', status: 'REVOKED', connectedAt: null }
    expect((await readStatus()).problem).toBe('credentialRefused')
    db.link = { hqUrl: 'https://hq.example.com', status: 'ACTIVE', connectedAt: null }
    manager.problem = 'unreachable'
    manager.connectionState.mockReturnValueOnce('connected')
    expect((await readStatus()).problem).toBeNull()
  })

  it('says when a restore onto another machine replaced this copy, and only for a link hq refused', async () => {
    db.link = { hqUrl: 'https://hq.example.com', status: 'REVOKED', connectedAt: null, replacedAt: new Date('2026-10-15T09:33:00.000Z') }
    expect(await readStatus()).toMatchObject({ problem: 'credentialRefused', replaced: { at: '2026-10-15T09:33:00.000Z' } })
    db.link = { hqUrl: 'https://hq.example.com', status: 'REVOKED', connectedAt: null }
    expect((await readStatus()).replaced).toBeNull()
  })

  it('puts a problem pairing at this start before the link an earlier start stored', async () => {
    db.link = { hqUrl: 'http://ns-hq-web:4100', status: 'DEGRADED', connectedAt: null }
    manager.problem = 'unreachable'
    setPairingProblem('secretTooShort')
    try {
      expect((await readStatus()).problem).toBe('secretTooShort')
    } finally {
      setPairingProblem(null)
    }
  })

  it('says when it is hq\'s own site, paired by its secret', async () => {
    vi.stubEnv('HQ_URL', 'http://ns-hq-web:4100')
    vi.stubEnv('HQ_PAIRING_SECRET', 's'.repeat(64))
    try {
      expect((await readStatus()).pairedBySecret).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reports the link and why it is not connected', async () => {
    db.link = { hqUrl: 'https://hq.example.com', status: 'DEGRADED', connectedAt: null }
    manager.lastError = 'connect ECONNREFUSED 10.0.0.2:443'
    const status = await readStatus()
    expect(status.hq).toMatchObject({ url: 'https://hq.example.com', status: 'DEGRADED', connected: false, lastError: 'connect ECONNREFUSED 10.0.0.2:443' })
  })
})

describe('status while hq moves (host-management spec §13)', () => {
  it('says which address hq said it moves to, since when, and how the last check went', async () => {
    db.link = {
      hqUrl: 'http://203.0.113.10:4100', status: 'DEGRADED', connectedAt: null,
      movingTo: 'http://198.51.100.24:4100', movingSince: new Date('2026-10-14T09:12:00Z'), moveProblem: 'unreachable',
    }
    const status = await readStatus()
    expect(status.hq?.url).toBe('http://203.0.113.10:4100')
    expect(status.moving).toEqual({ to: 'http://198.51.100.24:4100', since: '2026-10-14T09:12:00.000Z', problem: 'unreachable' })
  })
})

describe('status of a link hq no longer recognises', () => {
  it('reports REVOKED with the reason it was removed', async () => {
    db.link = { hqUrl: 'https://hq.example.com', status: 'REVOKED', connectedAt: null }
    manager.lastError = 'hq does not recognise this site — a fleet admin adds it again in the Fleet Console'
    const status = await readStatus()
    expect(status.hq).toMatchObject({ status: 'REVOKED', connected: false, lastError: 'hq does not recognise this site — a fleet admin adds it again in the Fleet Console' })
  })
})
