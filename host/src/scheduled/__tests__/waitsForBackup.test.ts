import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { installed } from '../../service/context'
import { ownerHandler } from '../../owner/dispatch'
import { nightlyTick } from '../../backups/nightly'
import { BUSY_WAIT_MS, waitingText } from '../../backups/take'
import { gate, hold, openAt, slowDump } from '../../backups/__tests__/held'
import { binEntries } from '../../lifecycle/bin'
import { tickScheduled } from '../scheduler'
import { readStore } from '../store'
import type { HqStatusData } from '../../hq/control'

const ADDRESS = 'https://hq.acme.example'
const MIN = 60_000
/** The nightly backup's time, 02:00, the night of 12 October. */
const NIGHTLY = new Date(2026, 9, 13, 2, 0)
const after = (minutes: number) => new Date(NIGHTLY.getTime() + minutes * MIN)

let m: FakeMachine
const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>
const sentToHq = (): ScheduledChangeNotice[] =>
  m.calls.filter(c => c[0] === 'exec' && c.includes('scheduled-change')).map(c => JSON.parse(c[c.length - 1]) as ScheduledChangeNotice)

beforeEach(async () => {
  m = fakeMachine()
  await m.ctx.sleep(new Date(2026, 8, 30, 12, 0).getTime() - m.ctx.now().getTime())
  await install(m.ctx, { address: ADDRESS }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  await m.ctx.sleep(after(-60).getTime() - m.ctx.now().getTime())
  m.calls.length = 0
})
afterEach(() => m.cleanup())

const scheduleErase = () => ask({ op: 'schedule', at: NIGHTLY.toISOString(), change: { op: 'erase', target: 'hq', confirmAddress: ADDRESS } })

describe('a scheduled change due at the nightly backup’s time', () => {
  it('waits for the backup to finish, says so, then runs', async () => {
    expect(await scheduleErase()).toMatchObject({ ok: true })
    await m.ctx.sleep(60 * MIN)
    const dump = gate()
    slowDump(m.ctx, dump)
    const nightly = nightlyTick(m.ctx)
    openAt(m.ctx, after(10), dump, nightly)
    await tickScheduled(m.ctx)

    expect(await nightly).toBe(true)
    expect(installed(m.ctx).hq).toBeNull()
    expect(Date.parse(binEntries(m.ctx)[0].erasedAt)).toBeGreaterThanOrEqual(after(10).getTime())
    const notices = sentToHq()
    // Started, waiting; then started with nothing to wait for. HQ, erased, hears no more; the change is done.
    expect(notices.map(n => [n.update, n.reason])).toEqual([['scheduled', null], ['started', waitingText('backup')], ['started', null]])
    expect(readStore(m.ctx.state).entries[0].change.state).toBe('done')
    expect(notices[1].reason).toMatch(/^Waiting for the backup to finish/)
  })

  it(`fails, saying why, when the backup has not finished after ${BUSY_WAIT_MS / MIN} minutes, and changes nothing`, async () => {
    await scheduleErase()
    await m.ctx.sleep(60 * MIN)
    const backup = gate()
    const held = hold('backup', backup)
    await tickScheduled(m.ctx)
    backup.open()
    await held

    const entry = readStore(m.ctx.state).entries[0]
    expect(entry.change.state).toBe('rolledBack')
    expect(entry.notice?.reason).toBe('The erase of HQ did not complete, and was put back as it was: The backup on this machine had not finished after 30 minutes, so the erase did not start. Nothing was changed.')
    expect(m.ctx.now().getTime()).toBeGreaterThanOrEqual(after(30).getTime())
    expect(installed(m.ctx).hq).not.toBeNull()
    expect(binEntries(m.ctx)).toEqual([])
  })

  it('an upgrade waits for it the same way, and says so', async () => {
    const status = (m.hq.status as unknown as { data: HqStatusData }).data
    m.hq.status = { ok: true, text: 'HQ', data: { ...status, version: '0.2.1' } }
    expect(await ask({ op: 'schedule', at: NIGHTLY.toISOString(), change: { op: 'upgrade', target: 'hq', version: '0.2.1' } })).toMatchObject({ ok: true })
    await m.ctx.sleep(60 * MIN)
    const backup = gate()
    const held = hold('backup', backup)
    openAt(m.ctx, after(5), backup, held)
    await tickScheduled(m.ctx)
    await held

    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.1')
    const notices = sentToHq()
    expect(notices.map(n => [n.update, n.reason])).toEqual([['scheduled', null], ['started', waitingText('backup')], ['started', null], ['completed', null]])
  })

  it('asked for now, an erase shows that it waits among its steps', async () => {
    const backup = gate()
    const held = hold('backup', backup)
    openAt(m.ctx, after(-50), backup, held)
    const steps: string[] = []
    const r = await ownerHandler(m.ctx)({ op: 'erase', target: 'hq', confirmAddress: ADDRESS }, p => { if (p.event === 'step') steps.push(p.step) }) as Record<string, any>
    expect(r).toMatchObject({ ok: true })
    expect(steps.slice(0, 2)).toEqual(['Waiting for the backup to finish', 'Taking the final sealed backup'])
  })

  it('says nothing of waiting when nothing holds the machine', async () => {
    await scheduleErase()
    await m.ctx.sleep(60 * MIN)
    await tickScheduled(m.ctx)
    expect(sentToHq().map(n => [n.update, n.reason])).toEqual([['scheduled', null], ['started', null]])
    expect(readStore(m.ctx.state).entries[0].change.state).toBe('done')
  })
})
