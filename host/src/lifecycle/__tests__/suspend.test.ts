import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { tickScheduled } from '../../scheduled/scheduler'
import { readStore } from '../../scheduled/store'
import { statusText } from '../../cli/statusText'
import { nightlyTick } from '../../backups/nightly'
import { BackupStore } from '../../backups/store'
import { suspended } from '../suspend'
import { HELP } from '../../cli/commands'

const MIN = 60_000
let m: FakeMachine
const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>
const sentToHq = (): ScheduledChangeNotice[] =>
  m.calls.filter(c => c[0] === 'exec' && c.includes('scheduled-change')).map(c => JSON.parse(c[c.length - 1]) as ScheduledChangeNotice)
const composeVerbs = () => m.calls.filter(c => c[0] === 'compose' && (c.includes('stop') || c.includes('up') || c.includes('down')))
  .map(c => `${c[c.indexOf('-p') + 1]} ${c[c.indexOf('-f') + 2]}`)

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.calls.length = 0
})
afterEach(() => m.cleanup())

describe('suspending and resuming', () => {
  it('suspends HQ now: its site and HQ stop, nothing is removed, and members are told @SC-842', async () => {
    expect(await ask({ op: 'suspend', target: 'hq' })).toMatchObject({ ok: true, result: { state: 'suspended' } })
    expect(composeVerbs()).toEqual(['agenthix-site stop', 'agenthix-hq stop'])
    // HQ hears it is starting before it stops; the end is offered again until HQ, resumed, takes it.
    expect(sentToHq().map(n => [n.update, n.change.kind])).toEqual([['scheduled', 'suspend'], ['started', 'suspend'], ['completed', 'suspend']])
    expect(readStore(m.ctx.state).entries[0].delivered).toBe(false)
    const status = await ask({ op: 'machine.status' })
    expect(status.result.lifecycle.suspended.hq).toBeTruthy()
    const text = statusText(status.result, m.ctx.now())
    expect(text).toContain('Suspended. Nothing is lost')
    expect(text).toContain('agenthix hq resume')
    expect(await ask({ op: 'suspend', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })

  it('resumes HQ: it and its site start again, and the suspension is forgotten @SC-842', async () => {
    await ask({ op: 'suspend', target: 'hq' })
    m.calls.length = 0
    expect(await ask({ op: 'resume', target: 'hq' })).toMatchObject({ ok: true, result: { state: 'started' } })
    expect(composeVerbs()).toEqual(['agenthix-hq up', 'agenthix-site up'])
    expect((await ask({ op: 'machine.status' })).result.lifecycle.suspended).toEqual({})
    expect(await ask({ op: 'resume', target: 'hq' })).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('is not suspended') } })
  })

  it('suspends the site alone, and status says how to start it @SC-842', async () => {
    await ask({ op: 'suspend', target: 'site' })
    expect(composeVerbs()).toEqual(['agenthix-site stop'])
    const text = statusText((await ask({ op: 'machine.status' })).result, m.ctx.now())
    expect(text).toContain('Not running. The site is suspended; nothing is lost.')
    expect(text).toContain('To start it: agenthix site resume')
  })

  it('suspends at a time, held like any scheduled change @SC-842', async () => {
    const at = new Date(m.ctx.now().getTime() + 60 * MIN).toISOString()
    const r = await ask({ op: 'schedule', at, change: { op: 'suspend', target: 'site' } })
    expect(r).toMatchObject({ ok: true, result: { change: { kind: 'suspend', target: 'site', state: 'scheduled', expectedMinutes: 0 } } })
    await m.ctx.sleep(60 * MIN)
    await tickScheduled(m.ctx)
    expect(composeVerbs()).toEqual(['agenthix-site stop'])
    expect(sentToHq().map(n => n.update)).toEqual(['scheduled', 'started', 'completed'])
  })
})

describe('follow-ups to suspending', () => {
  // The fake clock moves only when something sleeps, so the test sleeps to just after 02:00 on the next night.
  const nightly = () => m.ctx.sleep(new Date(2026, 9, 15, 3, 0).getTime() - m.ctx.now().getTime())

  it('takes no nightly backup while suspended, records no failed night, and says so in status @SC-832', async () => {
    await ask({ op: 'suspend', target: 'site' })
    await nightly()
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(new BackupStore(m.ctx.state).log()).toEqual({})
    const text = statusText((await ask({ op: 'machine.status' })).result, m.ctx.now())
    expect(text).toContain('Nightly backups wait while it is suspended')
    await ask({ op: 'resume', target: 'site' })
    expect(await nightlyTick(m.ctx)).toBe(true)
    expect(statusText((await ask({ op: 'machine.status' })).result, m.ctx.now())).not.toContain('Nightly backups wait')
  })

  it('takes no nightly backup while HQ is suspended @SC-832', async () => {
    await ask({ op: 'suspend', target: 'hq' })
    await nightly()
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(new BackupStore(m.ctx.state).log().last).toBeUndefined()
  })

  it('clears the suspended record when install starts the projects, so a later suspend is allowed @SC-842', async () => {
    await ask({ op: 'suspend', target: 'hq' })
    await install(m.ctx, 'https://hq.acme.example', () => {})
    expect(suspended(m.ctx)).toEqual({})
    expect(await ask({ op: 'suspend', target: 'hq' })).toMatchObject({ ok: true })
  })

  it('lists every change the site schedule row can make @SC-842', () => {
    const rows = HELP.filter(c => c.usage.startsWith('site schedule'))
    expect(rows).toHaveLength(1)
    for (const word of ['upgrade', 'resize', 'suspend', 'resume', 'move']) expect(rows[0].does + rows[0].detail).toContain(word)
  })
})
