import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { nightlyTick } from '../nightly'
import { BackupStore } from '../store'
import { gate, hold } from './held'

let m: FakeMachine
const store = () => new BackupStore(m.ctx.state)
const at = (d: Date) => {
  m.ctx.now = () => d
}

beforeEach(async () => {
  m = fakeMachine()
  await m.ctx.sleep(new Date(2026, 8, 30, 12, 0).getTime() - m.ctx.now().getTime())
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
})
afterEach(() => m.cleanup())

describe('a nightly backup that finds the machine held', () => {
  it.each(['move', 'erase', 'version upgrade', 'restore'])('by the %s, backs up as soon as it is free, the same night', async holder => {
    const change = gate()
    const held = hold(holder, change)
    at(new Date(2026, 9, 13, 2, 0))
    expect(await nightlyTick(m.ctx)).toBe(false)
    // Not tried yet, and nothing logged as failed: it waits for the machine.
    expect(store().log()).toEqual({})
    at(new Date(2026, 9, 13, 2, 25))
    expect(await nightlyTick(m.ctx)).toBe(false)
    change.open()
    await held
    at(new Date(2026, 9, 13, 2, 31))
    expect(await nightlyTick(m.ctx)).toBe(true)
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect((await store().list()).map(b => [b.header.kind, b.header.night])).toEqual([['nightly', '2026-10-12']])
    expect(store().log().last).toMatchObject({ ok: true })
  })

  it('records the night as skipped, with why, in the backup log when it is still held once the night is lost', async () => {
    const change = gate()
    const held = hold('move', change)
    at(new Date(2026, 9, 13, 2, 0))
    expect(await nightlyTick(m.ctx)).toBe(false)
    // The next night is due within six hours: this one is not caught up any more.
    at(new Date(2026, 9, 13, 20, 30))
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(store().log()).toMatchObject({
      triedNight: '2026-10-12',
      last: { at: new Date(2026, 9, 13, 20, 30).toISOString(), ok: false, error: 'The nightly backup due at 02:00 was skipped: the move that held the machine from 02:00 had not finished in time for it. The next is taken at its own time.' },
    })
    change.open()
    await held
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(await store().list()).toEqual([])
    // The next night backs up at its own time.
    at(new Date(2026, 9, 14, 2, 0))
    expect(await nightlyTick(m.ctx)).toBe(true)
  })

  it('logs why when it is refused before it begins', async () => {
    const paths = m.ctx.machinePaths
    m.ctx.machinePaths = async () => null
    at(new Date(2026, 9, 13, 2, 0))
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(store().log().last).toMatchObject({ ok: false, error: expect.stringContaining('cannot find its state folder') })
    m.ctx.machinePaths = paths
  })
})
