import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import type { HostIdentity } from '@agenthix/core'
import { cloudOperation } from '../../cloud/dispatch'
import { install } from '../../install/install'
import { pinCloudController } from '../../link/cloudController'
import { ownerHandler } from '../../owner/dispatch'
import { CLOUD_LOCATION_DIR, openCloudLocation, routedFolder } from '../cloudLocation'
import { s3ClientFor } from '../s3Folder'
import { BackupStore } from '../store'
import { takeBackup } from '../take'
import { FakeS3 } from './fakeS3'
import { withFeature } from '@agenthix/core/testing'

const KEY = crypto.randomBytes(32).toString('base64url')

let m: FakeMachine
let s3: FakeS3

const request = (over: Record<string, unknown> = {}) => ({
  op: 'backup.location.set', endpoint: 'https://store.example', bucket: 'org-backups', prefix: 'machines/m-1/', region: 'eu-1',
  accessKeyId: 'AKIAFAKEFAKEFAKE', secretAccessKey: 'fake-secret-not-real', sessionToken: 'fake-session-token',
  expiresAt: new Date(m.ctx.now().getTime() + 6 * 24 * 3600_000).toISOString(), key: KEY, ...over,
})
const cloud = (r: Record<string, unknown>) => cloudOperation(m.ctx, r) as Promise<Record<string, any>>
const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>

beforeEach(async () => {
  m = fakeMachine()
  s3 = new FakeS3()
  const keys = await generateHostKeys('cloud')
  await pinCloudController(m.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: m.ctx.now().toISOString() })
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.ctx.backupIO.folder = routedFolder(m.ctx.backupIO.folder, () => openCloudLocation(m.ctx.state, m.ctx.now(), s3.client))
})
afterEach(() => m.cleanup())

withFeature('cloud', () => {
  describe('backup.location.set @SC-1061', () => {
    it('points backups at the store and answers when the credentials lapse', async () => {
      const r = request()
      expect(await cloud(r)).toEqual({ ok: true, op: 'backup.location.set', result: { expiresAt: r.expiresAt } })
      expect(new BackupStore(m.ctx.state).location()).toMatchObject({ path: CLOUD_LOCATION_DIR, setBy: 'cloud' })
    })

    it('keeps the credentials where only the host service reads them, and the key only as its public half', async () => {
      await cloud(request())
      const file = m.ctx.state.path('backups', 'cloud-location.json')
      expect(fs.statSync(file).mode & 0o777).toBe(0o600)
      const all = fs.readdirSync(m.ctx.state.root, { recursive: true }).map(f => path.join(m.ctx.state.root, String(f)))
      for (const f of all.filter(f => fs.statSync(f).isFile() && f !== file)) {
        const text = fs.readFileSync(f, 'utf8')
        expect(text).not.toContain('fake-secret-not-real')
        expect(text).not.toContain(KEY)
      }
    })

    it('asked again, replaces only the credentials', async () => {
      await cloud(request())
      const first = new BackupStore(m.ctx.state).location()!
      await m.ctx.sleep(3600_000)
      const again = request({ secretAccessKey: 'another-fake-secret', expiresAt: new Date(m.ctx.now().getTime() + 6 * 24 * 3600_000).toISOString() })
      expect(await cloud(again)).toMatchObject({ ok: true, result: { expiresAt: again.expiresAt } })
      expect(new BackupStore(m.ctx.state).location()).toEqual(first)
      expect(JSON.parse(fs.readFileSync(m.ctx.state.path('backups', 'cloud-location.json'), 'utf8')).secretAccessKey).toBe('another-fake-secret')
    })

    it.each([
      ['plain http', { endpoint: 'http://store.example' }],
      ['a credential kept longer than 7 days', { expiresAt: new Date(Date.parse('2026-10-14T09:00:00Z') + 8 * 24 * 3600_000).toISOString() }],
      ['credentials that have lapsed', { expiresAt: '2026-10-13T09:00:00Z' }],
      ['a prefix that climbs out', { prefix: '../other/' }],
      ['a key of the wrong size', { key: 'AAAA' }],
      ['no session token', { sessionToken: '' }],
    ])('refuses %s without echoing a credential', async (_name, over) => {
      const r = await cloud(request(over))
      expect(r).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
      expect(JSON.stringify(r)).not.toMatch(/fake-secret|fake-session|AKIAFAKE/)
      expect(new BackupStore(m.ctx.state).location()).toBeNull()
    })

    it('is not something the Fleet Console, the CLI or a machine not enrolled can do', async () => {
      expect(await ask(request())).toMatchObject({ ok: false })
      fs.rmSync(m.ctx.state.path('link', 'cloud.json'), { force: true })
      expect(await cloud(request())).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    })

    it('makes a client that carries the session token', async () => {
      const a = { endpoint: 'https://store.example', bucket: 'b', prefix: 'p/', region: 'eu-1', accessKeyId: 'AKIAFAKE', secretAccessKey: 'fake', sessionToken: 'fake-session-token' }
      const client = s3ClientFor(a) as unknown as { config: { credentials: () => Promise<{ sessionToken?: string }> } }
      expect((await client.config.credentials()).sessionToken).toBe('fake-session-token')
    })
  })
})

withFeature('cloud', () => {
  describe('backups to the location @SC-1062', () => {
    beforeEach(async () => {
      await cloud(request())
    })

    it('stores each backup at <prefix><backup id> and lists, fetches and restores it by the location’s key', async () => {
      const taken = (await ask({ op: 'backup.take' })).result.backup
      expect(taken.inLocation).toBe(true)
      expect([...s3.objects.keys()]).toEqual([`machines/m-1/${taken.id}`])
      expect((await ask({ op: 'backup.list' })).result).toMatchObject({ location: 'read', backups: [{ id: taken.id, onMachine: true, inLocation: true }] })

      const wrong = await ask({ op: 'backup.fetch', backupId: taken.id, key: crypto.randomBytes(32).toString('base64url') })
      expect(wrong).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
      fs.rmSync(new BackupStore(m.ctx.state).path(`${(await new BackupStore(m.ctx.state).list())[0].name}`))
      expect((await ask({ op: 'backup.list' })).result.backups[0]).toMatchObject({ onMachine: false, inLocation: true })
      expect(await ask({ op: 'backup.fetch', backupId: taken.id, key: KEY })).toMatchObject({ ok: true, result: { backup: { id: taken.id } } })
      const restored = await ask({ op: 'backup.restore', source: { from: 'location', backupId: taken.id, key: KEY }, target: 'hq' })
      expect(restored).toMatchObject({ ok: true })
    })

    it('writes a backup again with backup.store', async () => {
      const taken = (await ask({ op: 'backup.take' })).result.backup
      s3.objects.clear()
      expect(await ask({ op: 'backup.store', backupId: taken.id })).toMatchObject({ ok: true })
      expect(s3.objects.size).toBe(1)
    })

    it('expects a refused delete when pruning, and leaves expiry to the store', async () => {
      s3.locked = true
      for (let i = 0; i < 32; i++) {
        await takeBackup(m.ctx, 'nightly')
        await m.ctx.sleep(24 * 3600_000)
        await cloud(request())
      }
      expect(s3.sent).toContain('DeleteObjectCommand')
      expect(s3.objects.size).toBe(32)
      expect(new BackupStore(m.ctx.state).log().copy).toMatchObject({ ok: true })
    })

    it('skips the copy with a clear status when the credentials have lapsed, and does not try the store', async () => {
      await m.ctx.sleep(7 * 24 * 3600_000)
      s3.sent.length = 0
      const taken = await ask({ op: 'backup.take' })
      expect(taken).toMatchObject({ ok: true, result: { backup: { inLocation: false } } })
      expect(s3.sent).toEqual([])
      const status = (await ask({ op: 'machine.status' })).result.backups
      expect(status.copy).toMatchObject({ ok: false, error: expect.stringContaining('have lapsed') })
      expect(status.location).toMatchObject({ setByCloud: true, path: 'set by Agenthix Cloud' })
      expect(JSON.stringify(status)).not.toMatch(/fake-secret|fake-session|AKIAFAKE|org-backups/)
    })

    it('splits a large backup in parts', async () => {
      const folder = openCloudLocation(m.ctx.state, m.ctx.now(), s3.client)
      const taken = (await ask({ op: 'backup.take' })).result.backup
      const [name] = (await folder.list(CLOUD_LOCATION_DIR)).map(f => f.name)
      const big = Buffer.alloc(17 * 1024 * 1024, 7)
      await folder.write(CLOUD_LOCATION_DIR, name, (async function* () { yield big.subarray(0, 9_000_000); yield big.subarray(9_000_000) })())
      expect(s3.sent).toContain('CompleteMultipartUploadCommand')
      expect(s3.objects.get(`machines/m-1/${taken.id}`)!.equals(big)).toBe(true)
    })

    it('refuses a folder location chosen on the machine while Cloud has set one', async () => {
      expect(await ask({ op: 'backup.location', path: '/mnt/nas' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    })
  })
})
