import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { BackupStore } from '../../backups/store'
import { collectFigures } from '../figures'

// The figures' backups (spec §12) are what the host service's own backup log says: the Fleet Console's fleet shows the
// last backup from them. The backup location's path stays on the machine; the figures say only whether one is set.

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
})
afterEach(() => m.cleanup())

describe('the figures’ backups @SC-832', () => {
  it('say none yet before the first, at the fleet’s backup time', async () => {
    m.ctx.state.writeJson(['backups', 'time.json'], { hour: 3, minute: 30 })
    expect((await collectFigures(m.ctx)).backups).toEqual({
      lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '03:30',
    })
  })

  it('carry the last backup, its copy and export, and whether a location is set, but not its path', async () => {
    const store = new BackupStore(m.ctx.state)
    store.setLocation({ path: '/mnt/nas/agenthix', publicKey: 'pk', setAt: '2026-10-01T00:00:00.000Z' })
    store.record({
      last: { at: '2026-10-15T02:00:00.000Z', ok: true, id: 'b1', sizeBytes: 10 },
      copy: { at: '2026-10-15T02:10:00.000Z', ok: true, path: '/mnt/nas/agenthix/b1' },
      lastExportAt: '2026-10-14T10:00:00.000Z',
    })
    const figures = await collectFigures(m.ctx)
    expect(figures.backups).toEqual({
      lastNightlyAt: '2026-10-15T02:00:00.000Z', lastNightlyOk: true, locationSet: true,
      lastCopyAt: '2026-10-15T02:10:00.000Z', lastExportAt: '2026-10-14T10:00:00.000Z', nightlyAt: '02:00',
    })
    expect(JSON.stringify(figures)).not.toContain('/mnt/nas')
  })

  it('say a backup failed, and do not count a copy that failed', async () => {
    new BackupStore(m.ctx.state).record({
      last: { at: '2026-10-15T02:00:00.000Z', ok: false, error: 'disk full' },
      copy: { at: '2026-10-14T02:10:00.000Z', ok: false, path: '/mnt/nas/x', error: 'gone' },
    })
    const { backups } = await collectFigures(m.ctx)
    expect(backups).toMatchObject({ lastNightlyAt: '2026-10-15T02:00:00.000Z', lastNightlyOk: false, lastCopyAt: null })
    expect(JSON.stringify(backups)).not.toContain('disk full')
  })
})
