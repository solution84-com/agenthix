import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseHostRequest } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { installSecrets } from '../../state/secrets'
import { machineHolder } from '../keys'
import { BACKUP_MACHINE_OPS } from '../operations'
import { nightlyTick } from '../nightly'
import { openBackup } from '../seal'
import { BackupStore, NIGHTS_KEPT } from '../store'
import { nightOf } from '../take'

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  // Installed before the nights these tests back up.
  await m.ctx.sleep(new Date(2026, 8, 30, 12, 0).getTime() - m.ctx.now().getTime())
  await install(m.ctx, 'https://hq.acme.example', () => {})
})
afterEach(() => m.cleanup())

const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>
const store = () => new BackupStore(m.ctx.state)
const at = (iso: string) => {
  m.ctx.now = () => new Date(iso)
}

async function partsOf(file: string): Promise<Record<string, string>> {
  const { records } = await openBackup(fs.createReadStream(file) as AsyncIterable<Buffer>, machineHolder(m.ctx.state))
  const parts: Record<string, string> = {}
  let current = ''
  for await (const r of records) {
    if (r.type === 'begin') parts[(current = r.name)] = ''
    else if (r.type === 'data') parts[current] += r.bytes.toString('utf8')
  }
  return parts
}

describe('the nightly backup @SC-827', () => {
  it('labels a backup with the night before the small hours it is taken in', () => {
    expect(nightOf(new Date(2026, 9, 13, 2, 0))).toBe('2026-10-12')
    expect(nightOf(new Date(2026, 9, 9, 15, 20))).toBe('2026-10-09')
  })

  it('backs up HQ and its site at 02:00, once a night, sealed to the machine', async () => {
    at(new Date(2026, 9, 13, 1, 59).toISOString())
    expect(await nightlyTick(m.ctx)).toBe(false)
    at(new Date(2026, 9, 13, 2, 0).toISOString())
    expect(await nightlyTick(m.ctx)).toBe(true)
    expect(await nightlyTick(m.ctx)).toBe(false)
    const [b] = await store().list()
    expect(b.header).toMatchObject({ kind: 'nightly', night: '2026-10-12', holds: ['hq', 'site'], machine: 'hq-box', namespace: 'agenthix' })
    const file = fs.readFileSync(store().path(b.name))
    expect(file.includes(Buffer.from(installSecrets(m.ctx.state).hqMasterKey))).toBe(false)
    const parts = await partsOf(store().path(b.name))
    expect(Object.keys(parts)).toEqual(['manifest', 'hq/database', 'hq/storage', 'site/database', 'site/data', 'console/state'])
    expect(JSON.parse(parts.manifest).secrets.hqMasterKey).toBe(installSecrets(m.ctx.state).hqMasterKey)
    expect(parts['hq/database']).toContain('rows of agenthix')
    expect(parts['hq/storage']).toContain('volume:agenthix-hq-storage')
    expect(parts['site/data']).toContain('path:/home/sam/.agenthix/site/data')
  })

  it('catches a night missed while it was not running up once, as soon as it runs again', async () => {
    at(new Date(2026, 9, 13, 9, 0).toISOString())
    expect(await nightlyTick(m.ctx)).toBe(true)
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect((await store().list()).map(b => b.header.night)).toEqual(['2026-10-12'])
  })

  it('catches up only the last night of several missed, and never just before the next one is due', async () => {
    // Off from the 10th to 18:00 on the 13th: the 13th's 02:00 is caught up, once; the nights before are not.
    at(new Date(2026, 9, 13, 18, 0).toISOString())
    expect(await nightlyTick(m.ctx)).toBe(true)
    // Off again until 01:00 on the 16th: the 15th's night is not caught up, since the 16th's is due within the hour.
    at(new Date(2026, 9, 16, 1, 0).toISOString())
    expect(await nightlyTick(m.ctx)).toBe(false)
    at(new Date(2026, 9, 16, 2, 0).toISOString())
    expect(await nightlyTick(m.ctx)).toBe(true)
    expect((await store().list()).map(b => b.header.night).sort()).toEqual(['2026-10-13', '2026-10-15'])
  })

  it('does not catch up a night from before the site was installed', async () => {
    const fresh = fakeMachine()
    try {
      await fresh.ctx.sleep(new Date(2026, 9, 20, 9, 0).getTime() - fresh.ctx.now().getTime())
      await install(fresh.ctx, 'https://hq.acme.example', () => {})
      expect(await nightlyTick(fresh.ctx)).toBe(false)
      fresh.ctx.now = () => new Date(2026, 9, 21, 2, 0)
      expect(await nightlyTick(fresh.ctx)).toBe(true)
    } finally {
      fresh.cleanup()
    }
  })

  it('tries a failed night only once', async () => {
    at(new Date(2026, 9, 14, 2, 5).toISOString())
    m.backups.failDump.add('agenthix_site')
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(store().log().last).toMatchObject({ ok: false, error: expect.stringContaining('connection to agenthix-site-db lost') })
    expect(fs.readdirSync(store().dir())).toEqual([])
    m.backups.failDump.clear()
    expect(await nightlyTick(m.ctx)).toBe(false)
  })

  it(`keeps the last ${NIGHTS_KEPT} nights on the machine`, async () => {
    for (let d = 1; d <= NIGHTS_KEPT + 2; d++) {
      at(new Date(2026, 9, d, 2, 0).toISOString())
      await nightlyTick(m.ctx)
    }
    const nights = (await store().list()).map(b => b.header.night)
    expect(nights).toHaveLength(NIGHTS_KEPT)
    expect(nights[nights.length - 1]).toBe('2026-10-02')
  })
})

describe('what a controller may ask @SC-830', () => {
  it('never includes setting the backup location or any other of the machine’s own backup operations', () => {
    for (const op of BACKUP_MACHINE_OPS) {
      expect(parseHostRequest({ op, path: '/mnt/x', from: '/mnt/x', name: 'x', key: 'k', pendingId: 'p', label: 'location' }))
        .toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
    }
  })

  it('takes a backup now, and reports it in status', async () => {
    const answer = await ask({ op: 'backup.take' })
    expect(answer).toMatchObject({ ok: true, result: { backup: { holds: ['hq', 'site'], inLocation: false } } })
    const status = await ask({ op: 'machine.status' })
    expect(status.result.backups).toMatchObject({ carriesHq: true, last: { ok: true }, location: null, copy: null })
  })
})
