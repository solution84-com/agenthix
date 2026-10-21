import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'

const mockHqFindFirst = vi.hoisted(() => vi.fn())
const mockSiteConfigFindFirst = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: mockHqFindFirst, updateMany: vi.fn() },
    siteConfig: { findFirst: mockSiteConfigFindFirst },
  },
}))

import {
  _resetConnectionTokenWarning,
  connectionTokenStoreProblem,
  readConnectionToken,
  sealConnectionToken,
} from '../connectionToken'
import { hqConnectionManager } from '../hqConnection'

// Health reports would run real Docker commands; a channel test reports nothing.
hqConnectionManager.setHealthReporter(() => () => {})

const KEY = Buffer.alloc(32, 4).toString('base64')
const original = process.env.SECRETS_MASTER_KEY

let warnings: string[]
beforeEach(() => {
  process.env.SECRETS_MASTER_KEY = KEY
  _resetConnectionTokenWarning()
  warnings = []
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warnings.push(args.join(' ')) })
})
afterEach(() => {
  vi.restoreAllMocks()
  if (original === undefined) delete process.env.SECRETS_MASTER_KEY
  else process.env.SECRETS_MASTER_KEY = original
})

describe('the stored hq credential', () => {
  it('is written as ciphertext, not the credential, and reads back to it', () => {
    const stored = sealConnectionToken('smc_live_credential')
    expect(stored).not.toContain('smc_live_credential')
    expect(readConnectionToken(stored)).toBe('smc_live_credential')
  })

  it('reads a value stored in the clear as no credential, and says so once', () => {
    expect(readConnectionToken('smc_live_credential')).toBeNull()
    expect(readConnectionToken('smc_other')).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/in the clear/)
    expect(warnings[0]).not.toContain('smc_live_credential')
  })

  it('reads a value sealed under a different key as no credential, without throwing', () => {
    const stored = sealConnectionToken('smc_live_credential')
    process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 8).toString('base64')
    expect(readConnectionToken(stored)).toBeNull()
    expect(warnings).toHaveLength(1)
  })

  it('reads nothing as nothing, without a warning', () => {
    expect(readConnectionToken(null)).toBeNull()
    expect(warnings).toEqual([])
  })

  it('cannot be stored without SECRETS_MASTER_KEY, and says how to fix it', () => {
    delete process.env.SECRETS_MASTER_KEY
    expect(connectionTokenStoreProblem()).toMatch(/SECRETS_MASTER_KEY.*openssl rand -base64 32/)
    expect(() => sealConnectionToken('smc_live_credential')).toThrow(/SECRETS_MASTER_KEY/)
  })
})

describe('the channel with a credential stored in the clear', () => {
  it('does not dial hq, and never presents the stored value', async () => {
    let upgrades = 0
    const server = http.createServer((_req, res) => res.end())
    server.on('upgrade', (_req, socket) => { upgrades++; socket.destroy() })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const { port } = server.address() as { port: number }
    mockSiteConfigFindFirst.mockResolvedValue({ siteId: 's1' })
    mockHqFindFirst.mockResolvedValue({ status: 'ACTIVE', hqWsUrl: `ws://127.0.0.1:${port}/hq-link`, connectionToken: 'smc_plain' })

    await hqConnectionManager.start()
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(upgrades).toBe(0)
    expect(hqConnectionManager.lastError).toMatch(/no usable hq credential/)
    hqConnectionManager.stop()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
})
