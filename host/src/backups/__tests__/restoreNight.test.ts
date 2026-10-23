import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { controllerOperation } from '../../owner/controller'
import { readPin, writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { readSiteCredential } from '../../install/siteCompose'
import { listScheduled, scheduleChange, tickScheduled } from '../../scheduled/scheduler'
import { BackupStore } from '../store'

const LOCATION = '/mnt/nas/agenthix'
const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const
const DAY = 24 * 3600_000

const askOn = (m: FakeMachine, data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>

async function setLocation(m: FakeMachine): Promise<string> {
  fs.mkdirSync(m.backups.onMachine(LOCATION), { recursive: true })
  const prepared = await askOn(m, { op: 'backup.location', path: LOCATION })
  await askOn(m, { op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
  return prepared.result.key
}

/** A machine that runs a site a Fleet Console added, and no HQ. */
async function siteMachine(): Promise<FakeMachine> {
  const m = fakeMachine()
  m.ctx.machine.name = 'office-server'
  const fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example', hostId: 'h1',
    machineCredential: 'hmc_h1_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  const installed = await controllerOperation(m.ctx, { op: 'install', target: 'site', version: '0.2.0' }, fleetAdmin, readPin(m.ctx.state)!)
  if (!installed.ok) throw new Error(installed.refusal.message)
  return m
}

describe('backup.list', () => {
  let m: FakeMachine
  beforeEach(async () => {
    m = fakeMachine()
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  })
  afterEach(() => m.cleanup())

  it('lists the nights on the machine and in the backup location, newest first, each once, and nothing secret', async () => {
    const key = await setLocation(m)
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    await m.ctx.sleep(DAY)
    const tuesday = (await askOn(m, { op: 'backup.take' })).result.backup
    // A night that is only in the backup location now: removed from the machine, as older nights are.
    const mondayFile = (await new BackupStore(m.ctx.state).find(monday.id))!.name
    fs.rmSync(new BackupStore(m.ctx.state).path(mondayFile))

    const listed = await askOn(m, { op: 'backup.list' })
    expect(listed).toMatchObject({ ok: true, result: { location: 'read' } })
    expect(listed.result.backups).toEqual([
      { id: tuesday.id, night: tuesday.night, takenAt: tuesday.takenAt, kind: 'now', holds: ['hq', 'site'], sizeBytes: expect.any(Number), onMachine: true, inLocation: true },
      { id: monday.id, night: monday.night, takenAt: monday.takenAt, kind: 'now', holds: ['hq', 'site'], sizeBytes: expect.any(Number), onMachine: false, inLocation: true },
    ])
    const said = JSON.stringify(listed)
    for (const secret of [key, LOCATION, '.sealed', m.ctx.state.root]) expect(said).not.toContain(secret)
  })

  it('still lists the nights on the machine when the backup location cannot be read, and says so', async () => {
    await setLocation(m)
    await askOn(m, { op: 'backup.take' })
    fs.rmSync(m.backups.onMachine(LOCATION), { recursive: true })
    const listed = (await askOn(m, { op: 'backup.list' })).result
    expect(listed.location).toBe('unreadable')
    expect(listed.backups).toHaveLength(1)
    expect(listed.backups[0]).toMatchObject({ onMachine: true, inLocation: false })
  })

  it('says when no backup location is set', async () => {
    expect((await askOn(m, { op: 'backup.list' })).result).toEqual({ backups: [], location: 'none' })
  })
})

describe('restoring a site to an earlier night on its own machine', () => {
  let m: FakeMachine
  beforeEach(async () => { m = await siteMachine() })
  afterEach(() => m.cleanup())

  it('backs up the current state first, then brings back that night as the same site, and starts it', async () => {
    const credential = readSiteCredential(m.ctx.state)
    m.backups.databases.set('agenthix_site', Buffer.from('Monday'))
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    expect(monday.holds).toEqual(['site'])
    await m.ctx.sleep(DAY)
    m.backups.databases.set('agenthix_site', Buffer.from('Tuesday'))

    const r = await askOn(m, { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: monday.id } })
    expect(r).toMatchObject({ ok: true, result: { backup: { id: monday.id, night: monday.night } } })
    expect(m.backups.databases.get('agenthix_site')?.toString()).toBe('Monday')
    expect(readSiteCredential(m.ctx.state)).toBe(credential)
    expect(m.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'office-server', hqUrl: 'https://hq.acme.example' })
    expect(JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'data', 'restored.json'), 'utf8'))).toEqual({ night: monday.night, takenAt: monday.takenAt })
    expect(m.up.has('agenthix-site')).toBe(true)
    expect((await new BackupStore(m.ctx.state).list()).map(b => b.header.kind)).toEqual(['beforeRestore', 'now'])
  })

  it('restores a copy in the backup location with its key', async () => {
    const key = await setLocation(m)
    m.backups.databases.set('agenthix_site', Buffer.from('Monday'))
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    m.backups.databases.set('agenthix_site', Buffer.from('Tuesday'))
    expect(await askOn(m, { op: 'backup.restore', target: 'site', source: { from: 'location', backupId: monday.id, key: '9F3K-QX72-M8KD-4RT6-HZ0P-W5VB' } }))
      .toMatchObject({ ok: false, refusal: { message: expect.stringMatching(/^That key does not open this backup\. Nothing was changed\./) } })
    expect(m.backups.databases.get('agenthix_site')?.toString()).toBe('Tuesday')
    expect(await askOn(m, { op: 'backup.restore', target: 'site', source: { from: 'location', backupId: monday.id, key } })).toMatchObject({ ok: true })
    expect(m.backups.databases.get('agenthix_site')?.toString()).toBe('Monday')
  })

  it("refuses an earlier site's backup, and HQ as the target, changing nothing", async () => {
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    expect(await askOn(m, { op: 'backup.restore', target: 'hq', source: { from: 'machine', backupId: monday.id } }))
      .toMatchObject({ ok: false, refusal: { message: 'No HQ here: office-server runs no HQ, so there is no HQ to restore.' } })
    const settings = m.ctx.state.readJson('site', 'settings.json') as Record<string, unknown>
    m.ctx.state.writeJson(['site', 'settings.json'], { ...settings, installedAt: '2026-10-15T09:00:00.000Z' })
    m.backups.databases.set('agenthix_site', Buffer.from('the new site'))
    const r = await askOn(m, { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: monday.id } })
    expect(r).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('is of a site that ran on office-server before the one there now') } })
    expect(m.backups.databases.get('agenthix_site')?.toString()).toBe('the new site')
    expect((await new BackupStore(m.ctx.state).list()).map(b => b.header.kind)).toEqual(['now'])
  })

  it('runs at a time, held and told like any maintenance', async () => {
    m.backups.databases.set('agenthix_site', Buffer.from('Monday'))
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    m.backups.databases.set('agenthix_site', Buffer.from('Tuesday'))
    const at = new Date(m.ctx.now().getTime() + 3600_000).toISOString()
    const change = await scheduleChange(m.ctx, { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: monday.id } }, at, fleetAdmin)
    expect(change).toMatchObject({ kind: 'restore', target: 'site', detail: `night of ${monday.night}`, scheduledBy: { name: 'Avery Chen' } })
    await m.ctx.sleep(3600_000)
    await tickScheduled(m.ctx)
    expect(m.backups.databases.get('agenthix_site')?.toString()).toBe('Monday')
    expect(listScheduled(m.ctx)).toEqual([])
  })

  it('refuses at a time a backup that is not on the machine', async () => {
    const at = new Date(m.ctx.now().getTime() + 3600_000).toISOString()
    await expect(scheduleChange(m.ctx, { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: '0a1b2c3d' } }, at, fleetAdmin))
      .rejects.toThrow('There is no such backup on office-server')
    await expect(scheduleChange(m.ctx, { op: 'backup.restore', target: 'site', source: { from: 'location', backupId: '0a1b2c3d', key: 'k' } }, at, fleetAdmin))
      .rejects.toThrow('Only a backup kept on the machine can be restored at a time')
  })
})

describe('restoring HQ to an earlier night on its own machine', () => {
  let m: FakeMachine
  beforeEach(async () => {
    m = fakeMachine()
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  })
  afterEach(() => m.cleanup())

  it('leaves the Fleet Console that runs beside HQ as it is', async () => {
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    m.backups.folders.set('volume:agenthix-console-state', Buffer.from('the machines it knows now'))
    m.backups.created.length = 0
    expect(await askOn(m, { op: 'backup.restore', target: 'hq', source: { from: 'machine', backupId: monday.id } })).toMatchObject({ ok: true })
    expect(m.backups.folders.get('volume:agenthix-console-state')?.toString()).toBe('the machines it knows now')
    expect(m.backups.created).not.toContain('agenthix-console')
  })

  it('refuses the site alone as the target: it goes back with HQ', async () => {
    const monday = (await askOn(m, { op: 'backup.take' })).result.backup
    expect(await askOn(m, { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: monday.id } }))
      .toMatchObject({ ok: false, refusal: { message: 'hq-box runs HQ: its site goes back with HQ, so choose HQ to restore it.' } })
  })
})

describe('the refusal of restore --from where something runs', () => {
  it('names where in the Fleet Console a fleet admin restores an earlier night', async () => {
    const hq = fakeMachine()
    await install(hq.ctx, { address: 'https://hq.acme.example' }, () => {})
    await setLocation(hq)
    expect((await askOn(hq, { op: 'restore.list', from: LOCATION })).refusal.message).toBe(
      'Not restored: HQ already runs on hq-box. To go back to an earlier night, a fleet admin restores it in the Fleet Console, Backups › HQ, Restore… beside the night. It backs up the current state first.')
    hq.cleanup()
    const site = await siteMachine()
    expect((await askOn(site, { op: 'restore.list', from: LOCATION })).refusal.message).toBe(
      'Not restored: the site office-server already runs on office-server. To go back to an earlier night, a fleet admin restores it in the Fleet Console, Backups › office-server, Restore… beside the night. It backs up the current state first.')
    site.cleanup()
  })
})
