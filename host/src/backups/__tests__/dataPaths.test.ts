import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { renameDurably } from '../durable'
import { BackupStore } from '../store'
import { takeBackup } from '../take'

let m: FakeMachine
const DIR = '/mnt/nas/agenthix'
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  fs.mkdirSync(m.backups.onMachine(DIR), { recursive: true })
})
afterEach(() => m.cleanup())

const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>
const store = () => new BackupStore(m.ctx.state)

describe('the backup location, confirmed after Agenthix Cloud set one', () => {
  it('is refused, and Cloud\'s setting stays', async () => {
    const prepared = await ask({ op: 'backup.location', path: DIR })
    store().setLocation({ path: 'cloud-store', publicKey: 'k', setAt: m.ctx.now().toISOString(), setBy: 'cloud' })
    const r = await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
    expect(r).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(store().location()).toMatchObject({ path: 'cloud-store', setBy: 'cloud' })
  })
})

describe('a copy written to the location', () => {
  it('stays recorded as written when pruning the older copies fails afterwards', async () => {
    const prepared = await ask({ op: 'backup.location', path: DIR })
    await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
    const list = m.ctx.backupIO.folder.list
    m.ctx.backupIO.folder.list = async () => { throw new Error('the share went away') }
    const taken = await ask({ op: 'backup.take' })
    m.ctx.backupIO.folder.list = list
    expect(taken.ok).toBe(true)
    expect(taken.result.backup.inLocation).toBe(true)
    expect(fs.readdirSync(m.backups.onMachine(DIR))).toHaveLength(1)
  })
})

describe('backup.list in a location shared by machines', () => {
  it('lists only this machine\'s copies, not those of a machine whose name begins with its name', async () => {
    const prepared = await ask({ op: 'backup.location', path: DIR })
    await ask({ op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
    const taken = (await ask({ op: 'backup.take' })).result.backup
    const [mine] = fs.readdirSync(m.backups.onMachine(DIR))
    fs.rmSync(store().path(fs.readdirSync(store().dir()).find(n => n.endsWith('.sealed'))!))
    // The same file under a longer machine name: `hq-box-2-…` starts with `hq-box-`.
    fs.copyFileSync(path.join(m.backups.onMachine(DIR), mine), path.join(m.backups.onMachine(DIR), mine.replace(/^hq-box-/, 'hq-box-2-')))
    fs.rmSync(path.join(m.backups.onMachine(DIR), mine))
    const listed = (await ask({ op: 'backup.list' })).result
    expect(listed.location).toBe('read')
    expect(listed.backups.map((b: { id: string }) => b.id)).not.toContain(taken.id)
  })
})

describe('a backup written to the machine', () => {
  it('sweeps the .part file a crash left, once it has not been written to for an hour, and not one still being written', async () => {
    const stale = store().path('.old.sealed.part')
    const fresh = store().path('.new.sealed.part')
    fs.writeFileSync(stale, 'x')
    fs.writeFileSync(fresh, 'x')
    const now = m.ctx.now()
    const old = new Date(now.getTime() - 2 * 3600_000)
    fs.utimesSync(stale, old, old)
    await takeBackup(m.ctx, 'now')
    expect(fs.existsSync(stale)).toBe(false)
    expect(fs.existsSync(fresh)).toBe(true)
  })

  it('is flushed before it is renamed into place, and the folder after', () => {
    const calls: string[] = []
    const dir = fs.mkdtempSync(path.join(m.ctx.state.root, 'dur-'))
    fs.writeFileSync(path.join(dir, 'a.part'), 'bytes')
    const spy = (fs as unknown as { fsyncSync: (fd: number) => void })
    const real = spy.fsyncSync
    spy.fsyncSync = (fd: number) => { calls.push(fs.existsSync(path.join(dir, 'a.part')) ? 'fsync file' : 'fsync folder'); real(fd) }
    try {
      renameDurably(path.join(dir, 'a.part'), path.join(dir, 'a'))
    } finally {
      spy.fsyncSync = real
    }
    expect(calls).toEqual(['fsync file', 'fsync folder'])
    expect(fs.readFileSync(path.join(dir, 'a'), 'utf8')).toBe('bytes')
  })
})

describe('an HQ restore in place that stops partway', () => {
  it('says the backup taken just before it is on the machine', async () => {
    const monday = (await ask({ op: 'backup.take' })).result.backup
    m.ctx.backupIO.restoreDatabase = async () => { throw new Error('the database refused the rows') }
    const r = await ask({ op: 'backup.restore', target: 'hq', source: { from: 'machine', backupId: monday.id } })
    expect(r).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('The restore stopped partway: the database refused the rows') } })
    expect(r.refusal.message).toContain('The backup taken just before it is on hq-box: restore that one to go back')
  })
})
