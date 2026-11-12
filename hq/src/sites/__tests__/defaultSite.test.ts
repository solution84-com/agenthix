import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The pairing secret is pure configuration. The rest of defaultSite is tested
// against the real database (defaultSite.integration.test.ts), except that the
// id adoption and its clean-up commit together — which needs a transaction that
// does not commit, and so a stand-in for the client.
const mockFindFirst = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockDeleteMany = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
vi.mock('wasp/server', () => ({
  prisma: { executionSite: { findFirst: mockFindFirst }, $transaction: mockTransaction },
}))

import { pairingSecret, authenticateDefaultSite, hqMachineName } from '../defaultSite'
import { hashCredential } from '../credentials'
import { setDemoModeForTests } from '../../demo/demoMode'

const original = process.env.HQ_PAIRING_SECRET
afterEach(() => {
  if (original === undefined) delete process.env.HQ_PAIRING_SECRET
  else process.env.HQ_PAIRING_SECRET = original
})

describe('pairingSecret', () => {
  it('is null when unset', () => {
    delete process.env.HQ_PAIRING_SECRET
    expect(pairingSecret()).toBeNull()
  })
  it('is null when blank', () => {
    process.env.HQ_PAIRING_SECRET = '   '
    expect(pairingSecret()).toBeNull()
  })
  it('is null for a 31-character value', () => {
    process.env.HQ_PAIRING_SECRET = 'b'.repeat(31)
    expect(pairingSecret()).toBeNull()
  })
  it('is the trimmed value for a 32-character value', () => {
    process.env.HQ_PAIRING_SECRET = `  ${'c'.repeat(32)}\n`
    expect(pairingSecret()).toBe('c'.repeat(32))
  })
})

describe("HQ's own site is named after HQ's machine", () => {
  const given = process.env.HQ_MACHINE_NAME
  afterEach(() => {
    if (given === undefined) delete process.env.HQ_MACHINE_NAME
    else process.env.HQ_MACHINE_NAME = given
  })

  it('takes the name the host service gives', () => {
    process.env.HQ_MACHINE_NAME = '  hq-box \n'
    expect(hqMachineName()).toBe('hq-box')
  })

  it("falls back to the machine's own host name, never a control character or an overlong name", () => {
    for (const bad of ['', 'a\u0000b', 'x'.repeat(65)]) {
      process.env.HQ_MACHINE_NAME = bad
      expect(hqMachineName()).not.toBe(bad)
      expect(hqMachineName()).toMatch(/^[^\u0000-\u001f]{1,64}$/)
    }
  })
})

describe('adopting a new site id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs the update and the deletes only inside the transaction', async () => {
    const SECRET = 'a'.repeat(64)
    mockFindFirst.mockResolvedValue({ id: 'es-1', siteId: 'site-old', isDefault: true, status: 'ONLINE', credentialHash: hashCredential(SECRET) })
    // A transaction that never runs its callback: nothing may have been written outside it.
    mockTransaction.mockResolvedValue(undefined)
    await authenticateDefaultSite('site-new', SECRET).catch(() => {})
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  describe("the demo's seeded placements (adr-0186) @SC-1978", () => {
    const SECRET = 'a'.repeat(64)
    const tx = { executionSite: { findUnique: vi.fn(), update: vi.fn() }, workspacePlacement: { deleteMany: mockDeleteMany } }
    const adopt = async (lastSeenAt: Date | null) => {
      mockFindFirst.mockResolvedValue({ id: 'es-1', siteId: 'placeholder', isDefault: true, status: 'REGISTERED', credentialHash: hashCredential(SECRET) })
      tx.executionSite.findUnique.mockResolvedValue({ lastSeenAt })
      tx.executionSite.update.mockResolvedValue({ id: 'es-1', siteId: 'site-new' })
      mockDeleteMany.mockResolvedValue({ count: 2 })
      mockTransaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
      return authenticateDefaultSite('site-new', SECRET)
    }
    afterEach(() => setDemoModeForTests(null))

    it('are kept when the site first connects to a demo, its id replacing the placeholder', async () => {
      setDemoModeForTests(true)
      expect(await adopt(null)).toEqual({ id: 'es-1', siteId: 'site-new' })
      expect(mockDeleteMany).not.toHaveBeenCalled()
    })

    it('are cleared as before with the setting off, and in a demo whose site was seen before', async () => {
      setDemoModeForTests(false)
      await adopt(null)
      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { siteId: 'es-1' } })
      mockDeleteMany.mockClear()
      setDemoModeForTests(true)
      await adopt(new Date())
      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { siteId: 'es-1' } })
    })
  })
})
