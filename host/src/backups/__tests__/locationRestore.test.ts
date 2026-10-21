import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { installSecrets } from '../../state/secrets'
import { machineHolder, parseKeyWords } from '../keys'
import { holderFrom, openBackup, WrongKey } from '../seal'
import { BackupStore } from '../store'

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  fs.mkdirSync(m.backups.onMachine('/mnt/nas/agenthix'), { recursive: true })
})
afterEach(() => m.cleanup())

const askOn = (machine: FakeMachine, data: unknown) => ownerHandler(machine.ctx)(data, () => {}) as Promise<Record<string, any>>
const ask = (data: unknown) => askOn(m, data)
const inLocation = () => fs.readdirSync(m.backups.onMachine('/mnt/nas/agenthix'))

async function setLocation(): Promise<string> {
  const prepared = await ask({ op: 'backup.location', path: '/mnt/nas/agenthix' })
  expect(prepared).toMatchObject({ ok: true, result: { key: expect.stringMatching(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/) } })
  expect(await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })).toMatchObject({ ok: true })
  return prepared.result.key
}

describe('the backup location', () => {
  it('refuses a folder that does not exist, or cannot be written, before any key is made or anything set @SC-829', async () => {
    expect(await ask({ op: 'backup.location', path: '/mnt/nas/agenthix-2' })).toMatchObject({
      ok: false, refusal: { message: '/mnt/nas/agenthix-2 does not exist on hq-box. Not set. Nothing changed. Check the folder is mounted, then run this again.' },
    })
    m.backups.unwritable.add('/mnt/nas/agenthix')
    const refused = await ask({ op: 'backup.location', path: '/mnt/nas/agenthix' })
    expect(refused).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('Permission denied') } })
    expect(refused.result).toBeUndefined()
    expect(await ask({ op: 'backup.location', path: 'relative/path' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(new BackupStore(m.ctx.state).location()).toBeNull()
  })

  it('is set only once the person confirms, keeping only the public half of the key @SC-829', async () => {
    const prepared = await ask({ op: 'backup.location', path: '/mnt/nas/agenthix' })
    expect(new BackupStore(m.ctx.state).location()).toBeNull()
    await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
    expect(new BackupStore(m.ctx.state).location()).toMatchObject({ path: '/mnt/nas/agenthix' })
    const stateFiles = fs.readdirSync(m.ctx.state.root, { recursive: true }).map(String)
    for (const f of stateFiles) {
      const full = path.join(m.ctx.state.root, f)
      if (fs.statSync(full).isFile()) expect(fs.readFileSync(full, 'utf8')).not.toContain(prepared.result.key)
    }
    expect(await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
  })

  it('gets a copy of each backup, which opens with the person’s key and not with the machine’s @SC-829', async () => {
    const key = await setLocation()
    const taken = await ask({ op: 'backup.take' })
    expect(taken.result.backup.inLocation).toBe(true)
    const [name] = inLocation()
    const file = () => fs.createReadStream(path.join(m.backups.onMachine('/mnt/nas/agenthix'), name)) as AsyncIterable<Buffer>
    await expect(openBackup(file(), machineHolder(m.ctx.state))).rejects.toBeInstanceOf(WrongKey)
    const { header } = await openBackup(file(), holderFrom(parseKeyWords(key)!))
    expect(header.id).toBe(taken.result.backup.id)
    expect((await ask({ op: 'machine.status' })).result.backups).toMatchObject({ location: { path: '/mnt/nas/agenthix' }, copy: { ok: true } })
  })

  it('saves a key to a small file only the machine admin can read @SC-829', async () => {
    const key = (await ask({ op: 'backup.location', path: '/mnt/nas/agenthix' })).result.key
    const saved = await ask({ op: 'backup.saveKey', key, label: 'location' })
    expect(saved.result.file).toMatch(/^\/home\/sam\/\.agenthix\/keys\/backup-location-key-.*\.txt$/)
    const local = m.ctx.state.path('keys', path.basename(saved.result.file))
    expect(fs.readFileSync(local, 'utf8').trim()).toBe(key)
    expect(fs.statSync(local).mode & 0o777).toBe(0o600)
  })
})

describe('an export @SC-831', () => {
  it('is sealed to a key made for it, of which the machine keeps nothing', async () => {
    const r = (await ask({ op: 'backup.exportNow' })).result
    expect(r.file).toMatch(/^\/home\/sam\/\.agenthix\/exports\/hq-box-.*-export-[0-9a-f]{8}\.sealed$/)
    const local = m.ctx.state.path('exports', r.exportId)
    await expect(openBackup(fs.createReadStream(local) as AsyncIterable<Buffer>, machineHolder(m.ctx.state))).rejects.toBeInstanceOf(WrongKey)
    expect((await openBackup(fs.createReadStream(local) as AsyncIterable<Buffer>, holderFrom(parseKeyWords(r.key)!))).header.holds).toEqual(['hq', 'site'])
    expect(JSON.stringify(new BackupStore(m.ctx.state).log())).not.toContain(r.key)
  })
})

describe('restoring HQ’s machine on a new one @SC-833', () => {
  let fresh: FakeMachine
  let key: string
  beforeEach(async () => {
    key = await setLocation()
    m.backups.databases.set('agenthix_hq', Buffer.from('HQ as it was'))
    await ask({ op: 'backup.take' })
    fresh = fakeMachine()
    fresh.ctx.machine.name = 'hq-box-2'
    fs.mkdirSync(fresh.backups.onMachine('/mnt'), { recursive: true })
    fs.cpSync(m.backups.onMachine('/mnt/nas'), fresh.backups.onMachine('/mnt/nas'), { recursive: true })
  })
  afterEach(() => fresh.cleanup())

  it('lists what the location holds without a key', async () => {
    const listed = await askOn(fresh, { op: 'restore.list', from: '/mnt/nas/agenthix' })
    expect(listed.result.backups).toEqual([expect.objectContaining({ header: expect.objectContaining({ machine: 'hq-box', holds: ['hq', 'site'] }) })])
  })

  it('refuses a key that is wrong, or not a key, in words and changing nothing', async () => {
    const name = inLocation()[0]
    const other = '9F3K-QX72-M8KD-4RT6-HZ0P-W5VB'
    expect(await askOn(fresh, { op: 'restore.run', from: '/mnt/nas/agenthix', name, key: other })).toMatchObject({
      ok: false, refusal: { message: expect.stringMatching(/^That key does not open this backup\. Nothing was changed\./) },
    })
    expect(await askOn(fresh, { op: 'restore.check', from: '/mnt/nas/agenthix', name, key: 'hello' })).toMatchObject({
      ok: false, refusal: { message: expect.stringMatching(/^That is not a key/) },
    })
    expect(fs.existsSync(fresh.ctx.state.path('hq', 'settings.json'))).toBe(false)
  })

  it('refuses a backup from another namespace, or from a newer version', async () => {
    const name = inLocation()[0]
    const other = fakeMachine('acme')
    fs.cpSync(m.backups.onMachine('/mnt/nas'), other.backups.onMachine('/mnt/nas'), { recursive: true })
    expect(await askOn(other, { op: 'restore.check', from: '/mnt/nas/agenthix', name, key })).toMatchObject({
      ok: false, refusal: { message: expect.stringContaining('This backup is of an install named "agenthix", and this machine\'s is "acme"') },
    })
    other.cleanup()
    fresh.ctx.machine.hostServiceVersion = '0.1.9'
    expect(await askOn(fresh, { op: 'restore.check', from: '/mnt/nas/agenthix', name, key })).toMatchObject({
      ok: false, refusal: { message: expect.stringContaining('taken from version 0.2.0, newer than this host service\'s 0.1.9') },
    })
  })

  it('brings back HQ and its site, their secrets, databases and folders, and leaves the site a note of the night', async () => {
    const name = inLocation()[0]
    expect((await askOn(fresh, { op: 'restore.check', from: '/mnt/nas/agenthix', name, key })).result)
      .toMatchObject({ machine: 'hq-box', siteName: 'hq-box', hqAddress: 'https://hq.acme.example' })
    const done = await askOn(fresh, { op: 'restore.run', from: '/mnt/nas/agenthix', name, key })
    // HQ's site is named after the machine it runs on now.
    expect(done).toMatchObject({ ok: true, result: { hqAddress: 'https://hq.acme.example', siteName: 'hq-box-2', hqAnswers: true } })
    expect(fresh.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'hq-box-2' })
    expect(fs.readFileSync(fresh.ctx.state.path('hq', 'compose.json'), 'utf8')).toContain('"HQ_MACHINE_NAME": "hq-box-2"')
    expect(installSecrets(fresh.ctx.state)).toEqual(installSecrets(m.ctx.state))
    expect(fresh.backups.databases.get('agenthix_hq')?.toString()).toBe('HQ as it was')
    expect(fresh.backups.folders.get('volume:agenthix-hq-storage')?.toString()).toBe('files of volume:agenthix-hq-storage')
    expect(fresh.backups.started).toEqual(['agenthix-hq:hq-db', 'agenthix-site:site-db'])
    // Compose makes the volumes a restore writes into, so that `compose down -v` removes them with the rest.
    expect(fresh.backups.created).toEqual(['agenthix-hq', 'agenthix-site', 'agenthix-console'])
    expect(JSON.parse(fs.readFileSync(fresh.ctx.state.path('site', 'data', 'restored.json'), 'utf8'))).toMatchObject({ night: expect.any(String) })
    expect(fresh.up).toEqual(new Set(['agenthix-hq', 'agenthix-site', 'agenthix-console']))
    // The Fleet Console comes back with its keys, so every machine's pin of it still holds.
    const fleetConsole = JSON.parse(fs.readFileSync(fresh.ctx.state.path('console', 'compose.json'), 'utf8'))
    expect(fleetConsole.services.console.environment.HQ_CONSOLE_PAIRING_SECRET).toBe(installSecrets(fresh.ctx.state).consolePairingSecret)
    const compose = JSON.parse(fs.readFileSync(fresh.ctx.state.path('hq', 'compose.json'), 'utf8'))
    expect(compose.services['hq-server'].environment.HQ_RESTORED_FROM).toEqual(expect.stringMatching(/^\d{4}-\d\d-\d\dT/))
  })

  it('refuses where HQ already runs, pointing to the Fleet Console', async () => {
    expect(await ask({ op: 'restore.list', from: '/mnt/nas/agenthix' })).toMatchObject({
      ok: false, refusal: { message: expect.stringMatching(/^Not restored: HQ already runs on hq-box\./) },
    })
  })
})

describe('restoring on the same machine @SC-833', () => {
  it('backs up what is there first, then restores the night chosen', async () => {
    m.backups.databases.set('agenthix_hq', Buffer.from('Monday'))
    const monday = (await ask({ op: 'backup.take' })).result.backup
    await m.ctx.sleep(60_000)
    m.backups.databases.set('agenthix_hq', Buffer.from('Tuesday'))
    const r = await ask({ op: 'backup.restore', target: 'hq', source: { from: 'machine', backupId: monday.id } })
    expect(r).toMatchObject({ ok: true, result: { backup: { id: monday.id } } })
    expect(m.backups.databases.get('agenthix_hq')?.toString()).toBe('Monday')
    const kinds = (await new BackupStore(m.ctx.state).list()).map(b => b.header.kind)
    expect(kinds).toEqual(['beforeRestore', 'now'])
  })
})
