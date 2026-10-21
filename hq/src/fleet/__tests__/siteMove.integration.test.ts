/**
 * A site's move as hq records it (host-management spec §13 *A site moves*), against the real test database: the
 * site keeps its row, its id and its credential, and only the machine under it changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { revoke: () => {}, isOnline: () => false, get: () => null }, ChannelRequestFailed }
})

import { registerSite } from '../siteCredentials'
import { moveSite, openTransfer } from '../siteMove'
import { transferOpenCommand } from '../hqMove'
import { RelayHub } from '../relay/relayHub'
import { hashCredential } from '../../sites/credentials'

const machine = (fp: string, fleetConsole = 'm') => prisma.relayHost.create({
  data: { fingerprint: fp.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: `machine-${fp}`, consoleFingerprint: fleetConsole.repeat(64), credentialHash: `${fp}h`.repeat(32) },
})

let oldHost: string
let newHost: string

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Test org' } })
  oldHost = (await machine('a')).id
  newHost = (await machine('b')).id
})

describe('site.move @SC-927', () => {
  it("records the new machine under the same site, its credential unchanged, named after the new machine", async () => {
    const { executionSiteId } = await registerSite({ hostId: oldHost, credentialHash: hashCredential('c'.repeat(64)) })
    const before = await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })
    expect(await moveSite({ executionSiteId, toHostId: newHost })).toEqual({ moved: true })
    const after = await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })
    expect(after).toMatchObject({ relayHostId: newHost, siteId: before.siteId, credentialHash: before.credentialHash, label: 'machine-b' })
    expect(before.label).toBe('machine-a')
    expect(await moveSite({ executionSiteId, toHostId: newHost })).toEqual({ moved: false })
  })

  it('refuses a machine that carries a site already, or is not in the fleet', async () => {
    const { executionSiteId } = await registerSite({ hostId: oldHost, credentialHash: hashCredential('c'.repeat(64)) })
    await registerSite({ hostId: newHost, credentialHash: hashCredential('d'.repeat(64)) })
    await expect(moveSite({ executionSiteId, toHostId: newHost })).rejects.toMatchObject({ code: 'not_allowed' })
    const gone = await machine('c')
    await prisma.relayHost.update({ where: { id: gone.id }, data: { disconnectedAt: new Date() } })
    await expect(moveSite({ executionSiteId, toHostId: gone.id })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('transfer.open @SC-927', () => {
  it('opens a transfer only between two machines of the same Fleet Console', async () => {
    const hub = new RelayHub({ knownHost: async () => null })
    const expiresAt = new Date(Date.now() + 3600_000).toISOString()
    expect(await openTransfer(hub, { transferId: 'transfer-1', fromHostId: oldHost, toHostId: newHost, expiresAt })).toEqual({ opened: true })
    expect(hub.transfers.isOpen('transfer-1')).toBe(true)
    const elsewhere = (await machine('d', 'n')).id
    await expect(openTransfer(hub, { transferId: 'transfer-2', fromHostId: oldHost, toHostId: elsewhere, expiresAt })).rejects.toMatchObject({ code: 'not_allowed' })
    await expect(openTransfer(hub, { transferId: 'transfer-3', fromHostId: oldHost, toHostId: oldHost, expiresAt })).rejects.toMatchObject({ code: 'not_allowed' })
  })
})

describe("transfer-open, for the last steps of hq's own move @SC-927", () => {
  it('opens a route that waits for both machines, between two machines of the same Fleet Console only', async () => {
    const hub = new RelayHub({ knownHost: async () => null })
    expect(await transferOpenCommand(hub, ['transfer-hq-1', 'a'.repeat(64), 'b'.repeat(64)])).toMatchObject({ ok: true, data: { opened: true } })
    expect(hub.transfers.isOpen('transfer-hq-1')).toBe(true)
    await machine('d', 'n')
    expect(await transferOpenCommand(hub, ['transfer-hq-2', 'a'.repeat(64), 'd'.repeat(64)])).toMatchObject({ ok: false })
    expect(await transferOpenCommand(hub, ['transfer-hq-3', 'a'.repeat(64), 'e'.repeat(64)])).toMatchObject({ ok: false, code: 'not_found' })
    expect(hub.transfers.isOpen('transfer-hq-2') || hub.transfers.isOpen('transfer-hq-3')).toBe(false)
  })
})
