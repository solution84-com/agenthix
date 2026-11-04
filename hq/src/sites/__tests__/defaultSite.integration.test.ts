import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'

vi.mock('wasp/server', () => ({ prisma }))

import { ensureDefaultSite, authenticateDefaultSite } from '../defaultSite'
import { authenticateSite, siteExists } from '../registrationService'
import { checkSiteUpgrade } from '../siteUpgrade'
import { hashCredential } from '../credentials'

const SECRET = '9'.repeat(64)
const original = process.env.HQ_PAIRING_SECRET
const originalMachine = process.env.HQ_MACHINE_NAME

beforeEach(async () => {
  process.env.HQ_PAIRING_SECRET = SECRET
  process.env.HQ_MACHINE_NAME = 'hq-box'
  await prisma.org.create({ data: { name: 'Test org' } })
})
afterEach(() => {
  if (original === undefined) delete process.env.HQ_PAIRING_SECRET
  else process.env.HQ_PAIRING_SECRET = original
  if (originalMachine === undefined) delete process.env.HQ_MACHINE_NAME
  else process.env.HQ_MACHINE_NAME = originalMachine
})

function upgradeRequest(siteId: string, credential: string) {
  const req = {
    headers: { 'x-site-id': siteId, authorization: `Bearer ${credential}`, 'x-site-protocol-version': SITE_PROTOCOL_VERSION },
  } as unknown as IncomingMessage
  const written: string[] = []
  const socket = { on: () => {}, write: (c: string) => { written.push(c) }, destroy: () => {} } as unknown as Duplex
  return { req, socket, written }
}

const deps = {
  authenticate: authenticateSite,
  siteExists,
  recordProtocolVersion: async () => {},
  markVersionMismatch: async () => {},
}

describe('the default site against a real database', () => {
  it('creates exactly one default row, hashed, and reports each later outcome', async () => {
    expect(await ensureDefaultSite()).toBe('created')
    expect(await ensureDefaultSite()).toBe('unchanged')
    const rows = await prisma.executionSite.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      isDefault: true, label: 'hq-box', status: 'REGISTERED', credentialHash: hashCredential(SECRET), livePreviewsAllowed: true,
    })
    expect(JSON.stringify(rows)).not.toContain(SECRET)

    process.env.HQ_PAIRING_SECRET = '8'.repeat(64)
    expect(await ensureDefaultSite()).toBe('updated')
    expect((await prisma.executionSite.findMany())).toHaveLength(1)
  })

  it("takes the name of the machine HQ starts on, moved or restored there", async () => {
    await ensureDefaultSite()
    process.env.HQ_MACHINE_NAME = 'lab-02'
    expect(await ensureDefaultSite()).toBe('updated')
    expect(await prisma.executionSite.findMany()).toMatchObject([{ isDefault: true, label: 'lab-02', credentialHash: hashCredential(SECRET) }])
  })

  it('writes nothing without a secret, and leaves an existing default row alone', async () => {
    await ensureDefaultSite()
    const before = await prisma.executionSite.findFirstOrThrow()
    delete process.env.HQ_PAIRING_SECRET
    expect(await ensureDefaultSite()).toBe('unpaired')
    expect(await prisma.executionSite.findFirstOrThrow()).toEqual(before)
  })

  it('sets a revoked default back to registered', async () => {
    await ensureDefaultSite()
    await prisma.executionSite.updateMany({ data: { status: 'REVOKED' } })
    expect(await ensureDefaultSite()).toBe('updated')
    expect((await prisma.executionSite.findFirstOrThrow()).status).toBe('REGISTERED')
  })

  it('the upgrade check accepts the secret from the site id the site\'s own database gave it, and the row adopts that id', async () => {
    await ensureDefaultSite()
    const { req, socket, written } = upgradeRequest('site-from-its-own-database', SECRET)
    const accepted = await checkSiteUpgrade(req, socket, deps)
    expect(accepted).toMatchObject({ siteId: 'site-from-its-own-database' })
    expect(written).toEqual([])
    expect((await prisma.executionSite.findFirstOrThrow()).siteId).toBe('site-from-its-own-database')

    // A wiped site database comes back with yet another id: adopted again.
    const second = upgradeRequest('second-id', SECRET)
    const again = await checkSiteUpgrade(second.req, second.socket, deps)
    expect(again).toMatchObject({ siteId: 'second-id' })
    expect(await prisma.executionSite.count()).toBe(1)
  })

  it('the upgrade check refuses a wrong secret with 401', async () => {
    await ensureDefaultSite()
    const { req, socket, written } = upgradeRequest('some-site', 'wrong')
    expect(await checkSiteUpgrade(req, socket, deps)).toBeNull()
    expect(written.join('')).toContain('401')
  })

  it('a registered site is unaffected by the default one', async () => {
    await ensureDefaultSite()
    await prisma.executionSite.create({
      data: { siteId: 'other', label: 'Build box', credentialHash: hashCredential('smc_other') },
    })
    expect(await authenticateSite('other', 'smc_other')).toMatchObject({ siteId: 'other', isDefault: false })
    expect(await authenticateSite('other', SECRET)).toBeNull()
  })

  it('adopting a new id keeps what hangs off the row: placements by row id and token audit references', async () => {
    await ensureDefaultSite()
    const row = await prisma.executionSite.findFirstOrThrow()
    const user = await prisma.user.create({ data: {} })
    await prisma.userStoragePlacement.create({ data: { userId: user.id, siteId: row.id } })
    await authenticateSite('new-id', SECRET)
    expect(await prisma.userStoragePlacement.count({ where: { siteId: row.id } })).toBe(1)
  })

  it('adopting a new id clears the rows that name the old one by string, and only those', async () => {
    await ensureDefaultSite()
    const row = await prisma.executionSite.findFirstOrThrow()
    const stale = (siteId: string, tag: string) => prisma.workspacePlacement.create({ data: { workspaceId: `ws-${tag}`, siteId } })
    await stale(row.id, 'old')
    await stale('some-other-site', 'other')

    await authenticateSite('new-id', SECRET)

    expect((await prisma.executionSite.findFirstOrThrow()).siteId).toBe('new-id')
    expect(await prisma.workspacePlacement.count({ where: { siteId: row.id } })).toBe(0)
    expect(await prisma.workspacePlacement.findMany()).toMatchObject([{ workspaceId: 'ws-other', siteId: 'some-other-site' }])

    // The same id again is a reconnect: it deletes nothing further.
    await stale('new-id', 'new')
    await authenticateSite('new-id', SECRET)
    expect(await prisma.workspacePlacement.count({ where: { siteId: 'new-id' } })).toBe(1)
    expect(await prisma.workspacePlacement.count()).toBe(2)
  })

  it('the very first pairing adopts the site\'s id without failing when nothing names the placeholder', async () => {
    await ensureDefaultSite()
    const placeholder = (await prisma.executionSite.findFirstOrThrow()).siteId
    await expect(authenticateSite('first-id', SECRET)).resolves.toMatchObject({ siteId: 'first-id' })
    expect((await prisma.executionSite.findFirstOrThrow()).siteId).not.toBe(placeholder)
  })

  it('writes nothing without a secret on an empty database', async () => {
    delete process.env.HQ_PAIRING_SECRET
    expect(await ensureDefaultSite()).toBe('unpaired')
    expect(await prisma.executionSite.count()).toBe(0)
  })

  it('creates the default row with no credential prefix, and a changed secret replaces only the hash', async () => {
    await ensureDefaultSite()
    const created = await prisma.executionSite.findFirstOrThrow()
    expect(created.credentialPrefix).toBeNull()
    process.env.HQ_PAIRING_SECRET = '8'.repeat(64)
    await ensureDefaultSite()
    expect(await prisma.executionSite.findFirstOrThrow()).toMatchObject({
      id: created.id, siteId: created.siteId, status: created.status, credentialHash: hashCredential('8'.repeat(64)),
    })
  })
})

describe('authenticateDefaultSite against a real database', () => {
  it('accepts the secret from the id the row already holds, without writing', async () => {
    await ensureDefaultSite()
    await authenticateDefaultSite('site-old', SECRET)
    const before = await prisma.executionSite.findFirstOrThrow()
    await expect(authenticateDefaultSite('site-old', SECRET)).resolves.toMatchObject({ id: before.id, siteId: 'site-old' })
    expect(await prisma.executionSite.findFirstOrThrow()).toEqual(before)
  })

  it('refuses a wrong secret and writes nothing', async () => {
    await ensureDefaultSite()
    const before = await prisma.executionSite.findFirstOrThrow()
    await expect(authenticateDefaultSite('site-new', 'wrong')).resolves.toBeNull()
    expect(await prisma.executionSite.findFirstOrThrow()).toEqual(before)
  })

  it('refuses when there is no default site, or it is revoked', async () => {
    await expect(authenticateDefaultSite('site-new', SECRET)).resolves.toBeNull()
    await ensureDefaultSite()
    await prisma.executionSite.updateMany({ data: { status: 'REVOKED' } })
    await expect(authenticateDefaultSite('site-new', SECRET)).resolves.toBeNull()
  })

  it('refuses rather than throws when the presented id already belongs to another site, and clears nothing', async () => {
    await ensureDefaultSite()
    const before = await prisma.executionSite.findFirstOrThrow()
    await prisma.executionSite.create({ data: { siteId: 'taken', label: 'Other', credentialHash: hashCredential('smc_other') } })
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws-1', siteId: before.id } })

    await expect(authenticateDefaultSite('taken', SECRET)).resolves.toBeNull()

    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: before.id } })).siteId).toBe(before.siteId)
    expect(await prisma.workspacePlacement.count()).toBe(1)
  })

  it('logs one line with the total cleared when it adopts a new id, and never the secret', async () => {
    await ensureDefaultSite()
    const rowId = (await prisma.executionSite.findFirstOrThrow()).id
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws-1', siteId: rowId } })
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws-2', siteId: rowId } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await authenticateDefaultSite('site-new', SECRET)
      expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/INFO +\[Sites\] default site adopted a new site id — cleared 2 stale row\(s\) naming the old one$/))
      expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET)
    } finally {
      log.mockRestore()
    }
  })
})
