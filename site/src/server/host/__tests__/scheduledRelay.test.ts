import { describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

import type { ScheduledChangeNotice } from '@agenthix/core'
import { HostFigures } from '../hostFigures'
import { parseScheduledNotices, startScheduledRelay } from '../scheduledRelay'

const ceilings = { memoryBytesPerContainer: 4 * 1024 ** 3, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 4 }

function notice(update: ScheduledChangeNotice['update'], sentAt: string, id = '1'): ScheduledChangeNotice {
  return {
    update,
    change: {
      id, kind: 'resize', target: 'site', siteName: 'office-server', machine: { name: 'office-server', fingerprint: 'f'.repeat(64) },
      at: '2026-10-18T02:00:00.000Z', scheduledBy: { kind: 'machineAdmin' }, scheduledAt: '2026-10-14T09:00:00.000Z',
      state: 'scheduled', detail: '6 GB', expectedMinutes: 1,
    },
    sentAt,
    reason: null,
  }
}

const answer = (notices: unknown) => ({
  ok: true, op: 'figures.read',
  result: { ceilings, protections: { holding: true, rules: [], checkedAt: new Date().toISOString(), problem: null }, scheduledNotices: notices },
})

describe('the scheduled changes’ notices the site passes to hq @SC-839', () => {
  it('are read from the figures, each checked, and none from an answer without them', () => {
    const good = notice('scheduled', '2026-10-14T09:00:00.000Z')
    expect(parseScheduledNotices(answer([good, { update: 'booked' }]))).toEqual([good])
    expect(parseScheduledNotices(answer(undefined))).toEqual([])
    expect(parseScheduledNotices({ ok: false })).toEqual([])
  })

  it('are sent once each while the channel is open, and a newer one of the same change is sent too', async () => {
    let served: ScheduledChangeNotice[] = [notice('scheduled', '2026-10-14T09:00:00.000Z')]
    const figures = new HostFigures('/run/host-figures/figures.sock', async () => answer(served))
    await figures.refresh()
    const sent: string[] = []
    const stop = startScheduledRelay(figures, n => sent.push(`${n.change.id} ${n.update}`))
    await figures.refresh()
    served = [notice('pausing', '2026-10-18T01:55:00.000Z'), notice('scheduled', '2026-10-14T10:00:00.000Z', '2')]
    await figures.refresh()
    expect(sent).toEqual(['1 scheduled', '1 pausing', '2 scheduled'])
    stop()
    served = [notice('completed', '2026-10-18T02:01:00.000Z')]
    await figures.refresh()
    expect(sent).toHaveLength(3)
  })

  it('are all offered again when the channel reopens, since hq may have missed any', async () => {
    const figures = new HostFigures('/run/host-figures/figures.sock', async () => answer([notice('scheduled', '2026-10-14T09:00:00.000Z')]))
    await figures.refresh()
    const sent: string[] = []
    startScheduledRelay(figures, n => sent.push(n.update))()
    startScheduledRelay(figures, n => sent.push(n.update))
    expect(sent).toEqual(['scheduled', 'scheduled'])
  })
})
