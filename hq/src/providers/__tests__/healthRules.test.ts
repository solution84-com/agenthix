import { describe, expect, it } from 'vitest'
import { nextHealth, checkDue, type Health } from '../healthRules'

const T0 = new Date('2026-10-23T10:00:00Z')
const at = (s: number) => new Date(T0.getTime() + s * 1000)
const working: Health = { state: 'works', failuresInRow: 0, lastFailedAt: null }

describe('nextHealth', () => {
  it('a success makes it work again, whatever it was', () => {
    for (const state of ['key_refused', 'out_of_credit', 'unreachable'] as const) {
      const r = nextHealth({ state, failuresInRow: 2, lastFailedAt: T0 }, { source: 'check', ok: true }, at(5))
      expect(r.health).toEqual({ state: 'works', failuresInRow: 0, lastFailedAt: null })
      expect(r.worked).toBe(true)
    }
  })

  it("an auth failure on a call changes nothing by itself: it asks for a check at once", () => {
    const r = nextHealth(working, { source: 'call', ok: false, kind: 'auth', detail: 'invalid x-api-key' }, T0)
    expect(r.health.state).toBe('works')
    expect(r.checkNow).toBe(true)
  })

  it('an auth failure confirmed by a check makes the key refused, with the vendor message', () => {
    const r = nextHealth(working, { source: 'check', ok: false, kind: 'auth', detail: 'invalid x-api-key' }, T0)
    expect(r.health.state).toBe('key_refused')
    expect(r.detail).toBe('invalid x-api-key')
    expect(r.checkNow).toBe(false)
  })

  it('a quota failure confirmed by a check makes it out of credit', () => {
    expect(nextHealth(working, { source: 'call', ok: false, kind: 'quota' }, T0)).toMatchObject({ health: { state: 'works' }, checkNow: true })
    expect(nextHealth(working, { source: 'check', ok: false, kind: 'quota' }, T0).health.state).toBe('out_of_credit')
  })

  it('a single server error changes nothing; three in a row, a minute apart, make it unreachable', () => {
    const fail = { source: 'call', ok: false, kind: 'unavailable' } as const
    let h = nextHealth(working, fail, at(0))
    expect(h.health).toMatchObject({ state: 'works', failuresInRow: 1 })
    expect(h.checkNow).toBe(true)
    h = nextHealth(h.health, fail, at(61))
    expect(h.health).toMatchObject({ state: 'works', failuresInRow: 2 })
    h = nextHealth(h.health, { ...fail, source: 'check' }, at(122))
    expect(h.health).toMatchObject({ state: 'unreachable', failuresInRow: 3 })
  })

  it('failures less than a minute apart count as one', () => {
    const fail = { source: 'call', ok: false, kind: 'unavailable' } as const
    let h = nextHealth(working, fail, at(0)).health
    h = nextHealth(h, fail, at(10)).health
    h = nextHealth(h, fail, at(20)).health
    h = nextHealth(h, fail, at(59)).health
    expect(h).toMatchObject({ state: 'works', failuresInRow: 1 })
    // The one counted keeps its own time, so the next minute is from it.
    expect(nextHealth(h, fail, at(61)).health.failuresInRow).toBe(2)
  })

  it('a rate limit, a bad request, a cancel or a spending cap is not a state', () => {
    for (const kind of ['rate-limit', 'invalid', 'cancelled', 'cap_reached', 'other'] as const) {
      const r = nextHealth(working, { source: 'call', ok: false, kind }, T0)
      expect(r.health).toEqual(working)
      expect(r.checkNow).toBe(false)
    }
  })

  it('server errors leave a refused key or no credit as it is', () => {
    const refused: Health = { state: 'key_refused', failuresInRow: 0, lastFailedAt: null }
    let h = refused
    for (let i = 0; i < 4; i++) h = nextHealth(h, { source: 'check', ok: false, kind: 'unavailable' }, at(i * 61)).health
    expect(h.state).toBe('key_refused')
  })
})

describe('checkDue', () => {
  it('a working provider is checked hourly, one not working every five minutes', () => {
    expect(checkDue({ state: 'works', lastCheckedAt: at(0) }, at(59 * 60))).toBe(false)
    expect(checkDue({ state: 'works', lastCheckedAt: at(0) }, at(60 * 60))).toBe(true)
    expect(checkDue({ state: 'unreachable', lastCheckedAt: at(0) }, at(4 * 60))).toBe(false)
    expect(checkDue({ state: 'key_refused', lastCheckedAt: at(0) }, at(5 * 60))).toBe(true)
  })

  it('one never checked is due', () => {
    expect(checkDue({ state: 'works', lastCheckedAt: null }, T0)).toBe(true)
  })

  it("Agenthix Cloud's states are its answers, never a check", () => {
    for (const state of ['not_available', 'disconnected'] as const) expect(checkDue({ state, lastCheckedAt: null }, T0)).toBe(false)
  })
})
