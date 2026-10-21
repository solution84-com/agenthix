import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { backupsStatus } from '../status'
import { BackupStore } from '../store'

// The backup log belongs to what was installed when it was written: a new site or HQ on a machine starts with no
// backup history of its own, rather than reporting the backups of the one the machine ran before.

const SITE = { name: 'office-server', version: '0.2.0', installedAt: '2026-10-01T00:00:00Z' }
const LAST = { at: '2026-10-14T21:47:00.000Z', ok: true, id: 'a1b2c3d4', sizeBytes: 4_000_000 }

let m: FakeMachine
beforeEach(() => {
  m = fakeMachine()
  m.ctx.state.writeJson(['site', 'settings.json'], SITE)
})
afterEach(() => m.cleanup())

describe('the backup log @SC-832', () => {
  it('is reported for the site it was written for', () => {
    new BackupStore(m.ctx.state).record({ last: LAST, lastExportAt: LAST.at })
    expect(backupsStatus(m.ctx)).toMatchObject({ last: LAST, lastExportAt: LAST.at })
  })

  it('is not reported for a new site on the same machine', () => {
    new BackupStore(m.ctx.state).record({ last: LAST, copy: { at: LAST.at, ok: true, path: '/mnt/nas' }, lastExportAt: LAST.at })
    fs.rmSync(m.ctx.state.path('site'), { recursive: true, force: true })
    m.ctx.state.writeJson(['site', 'settings.json'], { ...SITE, name: 'new-site', installedAt: '2026-10-15T08:00:00Z' })
    expect(backupsStatus(m.ctx)).toMatchObject({ last: null, copy: null, lastExportAt: null })
    expect(new BackupStore(m.ctx.state).log()).toEqual({})

    new BackupStore(m.ctx.state).record({ lastExportAt: '2026-10-15T09:00:00.000Z' })
    expect(backupsStatus(m.ctx)).toMatchObject({ last: null, lastExportAt: '2026-10-15T09:00:00.000Z' })
  })

  it('is not reported once HQ is installed beside a site that had none', () => {
    new BackupStore(m.ctx.state).record({ last: LAST })
    m.ctx.state.writeJson(['hq', 'settings.json'], { address: 'https://hq.acme.example', installedAt: '2026-10-15T08:00:00Z' })
    expect(new BackupStore(m.ctx.state).log()).toEqual({})
  })
})
