/**
 * Renewing a restored site's credential (adr-0119): who may, and when. The store is stood in for, so each rule is
 * tested on its own; the database's part is in siteRestore.integration.test.ts.
 */
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { renewRestoredSite, type RestoreSiteRow, type SiteRestoreDeps } from '../siteRestore'

const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const BACKUP = 'b'.repeat(64)
const NEW = 'n'.repeat(64)

let site: RestoreSiteRow
let connected: Set<string>
let online: Set<string>
let joins: Map<string, { joinId: string; executionSiteId: string }>
let committed: unknown[]
let closed: string[]
let announced: unknown[]

function deps(): SiteRestoreDeps {
  return {
    siteByCredential: async c => (hash(c) === site.credentialHash ? site : null),
    hostByCredential: async c => (c === 'hmc_new' ? { hostId: 'h-new', machineName: 'new-server' } : c === 'hmc_old' ? { hostId: 'h-old', machineName: 'office-server' } : null),
    restoreJoinOf: async hostId => joins.get(hostId) ?? null,
    machineName: async hostId => (hostId === 'h-old' ? 'office-server' : hostId === 'h-new' ? 'new-server' : null),
    commit: async p => {
      committed.push(p)
      if (p.expectedHash !== site.credentialHash) return { ok: false, reason: 'changed' }
      site = { ...site, credentialHash: p.newHash, relayHostId: p.hostId, label: p.label }
      joins.delete(p.hostId)
      return { ok: true }
    },
    siteConnected: siteId => connected.has(siteId),
    hostOnline: hostId => online.has(hostId),
    closeSite: siteId => { closed.push(siteId) },
    announce: async p => { announced.push(p) },
  }
}

const renew = (siteCredential: string, machineCredential: string, body: unknown) => renewRestoredSite({ siteCredential, machineCredential, body }, deps())

beforeEach(() => {
  site = { id: 'es-1', siteId: 'site-uuid', label: 'office-server', credentialHash: hash(BACKUP), relayHostId: 'h-old' }
  connected = new Set()
  online = new Set()
  joins = new Map([['h-new', { joinId: 'j-1', executionSiteId: 'es-1' }]])
  committed = []
  closed = []
  announced = []
})

describe('renewing a restored site’s credential @SC-928', () => {
  it('renews from the backup’s credential on the machine confirmed to restore it, and moves the site there, named after it', async () => {
    expect(await renew(BACKUP, 'hmc_new', { check: true })).toEqual({ status: 200, body: { executionSiteId: 'es-1', siteName: 'office-server' } })
    expect(committed).toEqual([])
    expect(await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })).toEqual({ status: 200, body: { executionSiteId: 'es-1', siteName: 'new-server' } })
    expect(site).toMatchObject({ credentialHash: hash(NEW), relayHostId: 'h-new', label: 'new-server' })
    expect(closed).toEqual(['site-uuid'])
    expect(announced).toEqual([{ label: 'office-server', machine: 'new-server' }])
  })

  it('is refused while the site is connected to HQ, and nothing changes', async () => {
    connected.add('site-uuid')
    const reply = await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })
    expect(reply).toEqual({ status: 409, body: { error: expect.stringContaining('Refused: office-server is connected to HQ right now.') } })
    expect(committed).toEqual([])
    expect(announced).toEqual([])
  })

  it('is refused while the machine the site runs on is connected, even with the site down', async () => {
    online.add('h-old')
    expect(await renew(BACKUP, 'hmc_new', { check: true })).toMatchObject({ status: 409, body: { error: expect.stringContaining('Refused: office-server is connected to HQ right now, so it is not lost') } })
    expect(committed).toEqual([])
  })

  it('refuses the old credential once renewed: the machine that comes back cannot connect or renew again', async () => {
    await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })
    joins.set('h-old', { joinId: 'j-2', executionSiteId: 'es-1' })
    expect(await renew(BACKUP, 'hmc_old', { credentialHash: hash('x'.repeat(64)) })).toMatchObject({ status: 401 })
    expect(await renew(BACKUP, 'hmc_new', { credentialHash: hash('y'.repeat(64)) })).toMatchObject({ status: 401 })
    expect(site.credentialHash).toBe(hash(NEW))
  })

  it('refuses a stolen backup on a machine no fleet admin confirmed for this site, even with the site down', async () => {
    joins = new Map()
    expect(await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })).toMatchObject({ status: 409, body: { error: expect.stringContaining('new-server was not connected to restore office-server') } })
    joins.set('h-new', { joinId: 'j-1', executionSiteId: 'es-other' })
    expect(await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })).toMatchObject({ status: 409 })
    expect(await renew(BACKUP, 'hmc_unknown', { credentialHash: hash(NEW) })).toMatchObject({ status: 401, body: { error: 'unauthorized' } })
    expect(committed).toEqual([])
  })

  it('refuses a stolen backup against a running site even from a machine confirmed to restore it', async () => {
    connected.add('site-uuid')
    online.add('h-old')
    expect(await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })).toMatchObject({ status: 409 })
    expect(site.credentialHash).toBe(hash(BACKUP))
  })

  it('answers again, changing nothing, to the new credential after a lost answer', async () => {
    await renew(BACKUP, 'hmc_new', { credentialHash: hash(NEW) })
    expect(await renew(NEW, 'hmc_new', { credentialHash: hash(NEW) })).toEqual({ status: 200, body: { executionSiteId: 'es-1', siteName: 'new-server' } })
    expect(await renew(NEW, 'hmc_old', { credentialHash: hash(NEW) })).toMatchObject({ status: 409 })
    expect(committed).toHaveLength(1)
    expect(announced).toHaveLength(1)
  })

  it('wants the hash of a new credential, and both credentials', async () => {
    expect(await renew(BACKUP, 'hmc_new', { credentialHash: 'not a hash' })).toMatchObject({ status: 400 })
    expect(await renew('', 'hmc_new', { check: true })).toMatchObject({ status: 401 })
    expect(await renew(BACKUP, '', { check: true })).toMatchObject({ status: 401 })
  })

  it('says so when the site changed between the check and the commit', async () => {
    const d = deps()
    d.commit = async () => ({ ok: false, reason: 'changed' })
    expect(await renewRestoredSite({ siteCredential: BACKUP, machineCredential: 'hmc_new', body: { credentialHash: hash(NEW) } }, d)).toMatchObject({ status: 409, body: { error: expect.stringContaining('changed while it was being renewed') } })
  })
})
