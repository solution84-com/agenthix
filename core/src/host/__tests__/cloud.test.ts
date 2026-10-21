import { describe, expect, it } from 'vitest'
import { AUTHENTICATOR_CODE, mayTurnOnRemoteAccess, parseRemoteAccessDuration, RECOVERY_CODE, REMOTE_ACCESS_DEFAULT_MS, REMOTE_ACCESS_MAX_MS } from '../cloud.js'

describe('who may turn remote access on', () => {
  it('only the Fleet Console\'s own machine: its local screen and the CLI', () => {
    expect(mayTurnOnRemoteAccess('localScreen')).toBe(true)
    expect(mayTurnOnRemoteAccess('cli')).toBe(true)
  })
  it('never a session through the tunnel, and never Cloud', () => {
    expect(mayTurnOnRemoteAccess('tunnel')).toBe(false)
    expect(mayTurnOnRemoteAccess('cloud')).toBe(false)
  })
})

describe('how long remote access runs', () => {
  it('is 2 hours when nothing is said', () => {
    expect(parseRemoteAccessDuration(undefined)).toEqual({ ok: true, ms: REMOTE_ACCESS_DEFAULT_MS })
  })
  it('reads hours and minutes, up to 8 hours', () => {
    expect(parseRemoteAccessDuration('90m')).toEqual({ ok: true, ms: 90 * 60_000 })
    expect(parseRemoteAccessDuration('1h30m')).toEqual({ ok: true, ms: 90 * 60_000 })
    expect(parseRemoteAccessDuration('8h')).toEqual({ ok: true, ms: REMOTE_ACCESS_MAX_MS })
  })
  it('refuses more than 8 hours, nothing, and what is not a length of time', () => {
    for (const bad of ['9h', '8h1m', '0m', '', 'soon', '-1h', '2']) expect(parseRemoteAccessDuration(bad).ok).toBe(false)
  })
})

describe('the codes a remote sign-in takes', () => {
  it('six digits from the app, or one recovery code', () => {
    expect(AUTHENTICATOR_CODE.test('603914')).toBe(true)
    expect(RECOVERY_CODE.test('k7qm-2xpa')).toBe(true)
  })
  it('nothing else', () => {
    for (const bad of ['60391', '6039145', '60391a', ' 603914', '']) expect(AUTHENTICATOR_CODE.test(bad)).toBe(false)
    for (const bad of ['k7qm2xpa', 'k7qm-2xp', 'K7QM-2XPA', 'k7qm-2xpa-']) expect(RECOVERY_CODE.test(bad)).toBe(false)
  })
})
