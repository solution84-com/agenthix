import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { machineCeilings } from '../../figures/figures'
import { cancelScheduled, changeScheduled, listScheduled, scheduleChange, tickScheduled } from '../scheduler'
import { registerScheduledChange } from '../registry'
import { noticesForSite } from '../notices'
import { readStore } from '../store'

const MIN = 60_000
const small = { memoryBytesPerContainer: 512 * 1024 ** 2, cpusPerContainer: 1, processesPerContainer: 256, containersAtOnce: 1 }
const resize = { op: 'capacity.set' as const, ceilings: small }
const machineAdmin = { kind: 'machineAdmin' as const }

let m: FakeMachine
const advance = (ms: number) => m.ctx.sleep(ms)
const inMinutes = (n: number) => new Date(m.ctx.now().getTime() + n * MIN).toISOString()

/** What hq was sent through its control socket, in order. */
function sentToHq(): ScheduledChangeNotice[] {
  return m.calls.filter(c => c[0] === 'exec' && c.includes('scheduled-change')).map(c => JSON.parse(c[c.length - 1]) as ScheduledChangeNotice)
}

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.calls.length = 0
})
afterEach(() => m.cleanup())

describe('scheduling a change @SC-839', () => {
  it('refuses a time that has passed, and holds nothing', async () => {
    await expect(scheduleChange(m.ctx, resize, inMinutes(-1), machineAdmin)).rejects.toThrow(/has passed/)
    await expect(scheduleChange(m.ctx, resize, m.ctx.now().toISOString(), machineAdmin)).rejects.toThrow(/choose a later time/)
    expect(listScheduled(m.ctx)).toEqual([])
  })

  it('refuses a change this version cannot schedule yet, in words', async () => {
    await expect(scheduleChange(m.ctx, { op: 'move', role: 'send', target: 'hq', peer: 'a'.repeat(64), peerIdentity: { role: 'host', signingKey: 'a'.repeat(43), sealingKey: 'b'.repeat(43) }, peerName: 'new-server', transferId: 'transfer-1' }, inMinutes(60), machineAdmin))
      .rejects.toThrow('cannot schedule that yet')
  })

  it('holds it, tells hq through its control socket, and runs it at its time', async () => {
    const change = await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    expect(change).toMatchObject({ id: '1', kind: 'resize', target: 'site', siteName: 'hq-box', state: 'scheduled', expectedMinutes: 1 })
    await tickScheduled(m.ctx)
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled'])

    await advance(56 * MIN)
    await tickScheduled(m.ctx)
    expect(listScheduled(m.ctx)[0].state).toBe('pausing')
    expect(machineCeilings(m.ctx)).not.toEqual(small)

    await advance(4 * MIN)
    await tickScheduled(m.ctx)
    expect(machineCeilings(m.ctx)).toEqual(small)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled', 'pausing', 'started', 'completed'])
    const sent = sentToHq().map(n => Date.parse(n.sentAt))
    expect([...sent].sort((a, b) => a - b)).toEqual(sent)
  })

  it('sends a changed time, and runs it at the new time only', async () => {
    const change = await scheduleChange(m.ctx, resize, inMinutes(10), machineAdmin)
    await changeScheduled(m.ctx, change.id, inMinutes(120))
    await advance(11 * MIN)
    await tickScheduled(m.ctx)
    expect(machineCeilings(m.ctx)).not.toEqual(small)
    expect(sentToHq().at(-1)).toMatchObject({ update: 'changed', change: { at: inMinutes(109) } })
  })

  it('never runs a cancelled change', async () => {
    const change = await scheduleChange(m.ctx, resize, inMinutes(10), machineAdmin)
    expect((await cancelScheduled(m.ctx, change.id)).state).toBe('cancelled')
    await advance(15 * MIN)
    await tickScheduled(m.ctx)
    expect(machineCeilings(m.ctx)).not.toEqual(small)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(sentToHq().at(-1)?.update).toBe('cancelled')
    await expect(cancelScheduled(m.ctx, change.id)).rejects.toThrow('Nothing is scheduled as 1')
  })

  it('keeps a notice hq did not take, and sends it once hq answers again', async () => {
    m.up.delete('agenthix-hq')
    await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await tickScheduled(m.ctx)
    expect(readStore(m.ctx.state).entries[0].delivered).toBe(false)
    m.up.add('agenthix-hq')
    await tickScheduled(m.ctx)
    expect(readStore(m.ctx.state).entries[0].delivered).toBe(true)
  })
})

describe('across a restart of the host service @SC-839', () => {
  it('still runs a change whose time came while it was down, when it is not long past', async () => {
    await scheduleChange(m.ctx, resize, inMinutes(30), machineAdmin)
    // Down from now until 10 minutes after the change's time: no tick ran. Everything it holds is in the state folder.
    await advance(40 * MIN)
    await tickScheduled(m.ctx)
    expect(machineCeilings(m.ctx)).toEqual(small)
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled', 'started', 'completed'])
  })

  it('reports a change long past as missed, in words, and does not run it', async () => {
    await scheduleChange(m.ctx, resize, inMinutes(30), machineAdmin)
    await advance(3 * 60 * MIN)
    await tickScheduled(m.ctx)
    expect(machineCeilings(m.ctx)).not.toEqual(small)
    const missed = sentToHq().at(-1)
    expect(missed?.update).toBe('missed')
    expect(missed?.reason).toMatch(/^The host service was not running at \w{3} \d+ \w{3} at \d{2}:\d{2}, so the resize of the site hq-box was not done\. Nothing changed\./)
  })
})

describe('a change that fails @SC-839', () => {
  registerScheduledChange('suspend', {
    kind: 'suspend', target: () => 'site', detail: () => null, expectedMinutes: 2, check: () => {},
    run: async () => { throw new Error('the site did not stop') },
  })

  it('is put back and reported failed, with why', async () => {
    await scheduleChange(m.ctx, { op: 'suspend', target: 'site' }, inMinutes(5), machineAdmin)
    await advance(5 * MIN)
    await tickScheduled(m.ctx)
    expect(sentToHq().at(-1)).toMatchObject({
      update: 'failed', change: { state: 'rolledBack' },
      reason: 'The suspension of the site hq-box did not complete, and was put back as it was: the site did not stop',
    })
  })
})

describe('on a site’s own machine @SC-839', () => {
  it('offers its notices to the site, which passes them to hq', async () => {
    const site = fakeMachine()
    try {
      site.ctx.state.writeJson(['site', 'settings.json'], { name: 'office-server', version: '0.2.0', installedAt: '2026-10-01T00:00:00Z' })
      const change = await scheduleChange(site.ctx, resize, new Date(site.ctx.now().getTime() + 60 * MIN).toISOString(), machineAdmin)
      expect(noticesForSite(site.ctx)).toEqual([expect.objectContaining({ update: 'scheduled', change: expect.objectContaining({ id: change.id, siteName: 'office-server' }) })])
      expect(noticesForSite(m.ctx)).toEqual([])
    } finally {
      site.cleanup()
    }
  })
})
