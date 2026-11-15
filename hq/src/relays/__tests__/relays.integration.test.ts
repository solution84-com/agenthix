/**
 * The Relay record, hq's relay registered by configuration, and every site placed on it, against the real test
 * database (adr-0153).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', () => ({ prisma }))

import { ensureHqRelay } from '../hqRelay'
import { authenticateRelay, recordRelayReport, recordRelaySeen } from '../relayStore'
import { placeSite, placeUnplacedSites } from '../placement'
import { hashCredential } from '../../sites/credentials'

const SECRET = 'r'.repeat(48)
const saved = { secret: process.env.HQ_RELAY_SECRET, machine: process.env.HQ_MACHINE_NAME, files: process.env.FILES_ORIGIN }

beforeEach(() => {
  process.env.HQ_RELAY_SECRET = SECRET
  process.env.HQ_MACHINE_NAME = 'hq-box'
  process.env.FILES_ORIGIN = 'https://files.example.com'
})
afterEach(() => {
  for (const [key, value] of [['HQ_RELAY_SECRET', saved.secret], ['HQ_MACHINE_NAME', saved.machine], ['FILES_ORIGIN', saved.files]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const site = (siteId: string, data: { status?: string; relayId?: string } = {}) =>
  prisma.executionSite.create({ data: { siteId, label: siteId, ...data } })
const hqRelay = () => prisma.relay.findFirstOrThrow({ where: { isHq: true } })

describe("hq's relay, by configuration @SC-1524", () => {
  it('creates exactly one row, hashed, on the files address, and reports each later outcome', async () => {
    expect(await ensureHqRelay()).toBe('created')
    expect(await ensureHqRelay()).toBe('unchanged')
    const rows = await prisma.relay.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ isHq: true, name: 'hq-box', address: 'https://files.example.com', state: 'ON', credentialHash: hashCredential(SECRET) })
    expect(JSON.stringify(rows)).not.toContain(SECRET)

    process.env.HQ_RELAY_SECRET = 's'.repeat(48)
    expect(await ensureHqRelay()).toBe('updated')
    expect(await prisma.relay.findMany()).toHaveLength(1)
  })

  it('without the secret, takes an existing row out of service so the old secret is refused', async () => {
    await ensureHqRelay()
    delete process.env.HQ_RELAY_SECRET
    expect(await ensureHqRelay()).toBe('unset')
    expect(await hqRelay()).toMatchObject({ state: 'REMOVED', credentialHash: null })
    expect(await authenticateRelay(SECRET)).toBeNull()

    process.env.HQ_RELAY_SECRET = SECRET
    expect(await ensureHqRelay()).toBe('updated')
    expect(await hqRelay()).toMatchObject({ state: 'ON', credentialHash: hashCredential(SECRET) })
  })

  it('writes nothing without a secret when there is no row', async () => {
    delete process.env.HQ_RELAY_SECRET
    expect(await ensureHqRelay()).toBe('unset')
    expect(await prisma.relay.count()).toBe(0)
  })
})

describe("a relay's link records @SC-1526", () => {
  it('authenticates only the secret it holds', async () => {
    await ensureHqRelay()
    const { id } = await hqRelay()
    expect(await authenticateRelay(SECRET)).toEqual({ relayId: id })
    expect(await authenticateRelay('x'.repeat(48))).toBeNull()
  })

  it('records when it was seen and its last report, but never revives a removed relay', async () => {
    await ensureHqRelay()
    const { id } = await hqRelay()
    await recordRelaySeen(id)
    expect(await hqRelay()).toMatchObject({ state: 'ON' })
    const load = { startedAt: '2026-10-26T10:00:00.000Z', sites: ['s1'], openStreams: 2, bytesCarried: 512 }
    await recordRelayReport(id, load)
    const after = await hqRelay()
    expect(after.load).toEqual(load)
    expect(after.lastSeenAt).not.toBeNull()

    await prisma.relay.update({ where: { id }, data: { state: 'REMOVED' } })
    await recordRelayReport(id, { ...load, openStreams: 9 })
    expect(await hqRelay()).toMatchObject({ state: 'REMOVED', load })
  })
})

describe('placement @SC-1527', () => {
  it("places a site without a relay on hq's relay, with hq's line path", async () => {
    await ensureHqRelay()
    const { id } = await hqRelay()
    await site('s1')
    expect(await placeSite('s1')).toEqual({ relayId: id, lineUrl: '/relay-line' })
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { siteId: 's1' } })).relayId).toBe(id)
  })

  it('keeps a site on the relay it holds while that relay is usable', async () => {
    await ensureHqRelay()
    const other = await prisma.relay.create({ data: { name: 'r2', address: 'https://files-2.example.com', credentialHash: hashCredential('o'.repeat(48)) } })
    await site('s1', { relayId: other.id })
    expect(await placeSite('s1')).toEqual({ relayId: other.id, lineUrl: 'https://files-2.example.com/relay-line' })
  })

  it("moves a site off a removed relay onto hq's", async () => {
    await ensureHqRelay()
    const { id } = await hqRelay()
    const gone = await prisma.relay.create({ data: { name: 'r2', address: 'https://files-2.example.com', state: 'REMOVED' } })
    await site('s1', { relayId: gone.id })
    expect(await placeSite('s1')).toEqual({ relayId: id, lineUrl: '/relay-line' })
  })

  it('gives no placement when no relay is available, or for a removed or unknown site', async () => {
    await site('s1')
    expect(await placeSite('s1')).toBeNull()
    await ensureHqRelay()
    await site('s2', { status: 'REVOKED' })
    expect(await placeSite('s2')).toBeNull()
    expect(await placeSite('nobody')).toBeNull()
  })

  it("places every unplaced, unremoved site on hq's relay at boot", async () => {
    await site('s1')
    await site('s2', { status: 'REVOKED' })
    expect(await placeUnplacedSites()).toBe(0)
    await ensureHqRelay()
    const { id } = await hqRelay()
    expect(await placeUnplacedSites()).toBe(1)
    const rows = await prisma.executionSite.findMany({ orderBy: { siteId: 'asc' } })
    expect(rows.map(r => r.relayId)).toEqual([id, null])
  })

  it("a relay's removal leaves its sites to be placed again", async () => {
    const r = await prisma.relay.create({ data: { name: 'r2' } })
    await site('s1', { relayId: r.id })
    await prisma.relay.delete({ where: { id: r.id } })
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { siteId: 's1' } })).relayId).toBeNull()
  })
})
