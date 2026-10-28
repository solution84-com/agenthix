import { describe, it, expect } from 'vitest'
import { effectiveDefault, switchState, type PlaceSkillSwitchRow } from '../switchState'

const row = (over: Partial<PlaceSkillSwitchRow> = {}): PlaceSkillSwitchRow => ({
  switch: null, switchFingerprint: null, lastFingerprint: 'a'.repeat(64), ...over,
})

describe('whether a skill found in files runs @SC-1642', () => {
  it('takes the stricter of the place and organisation defaults', () => {
    expect(effectiveDefault(null, 'OFF')).toBe('OFF')
    expect(effectiveDefault('ON', 'OFF')).toBe('OFF')
    expect(effectiveDefault('OFF', 'ON')).toBe('OFF')
    expect(effectiveDefault('NEVER', 'ON')).toBe('NEVER')
  })

  it('follows the default when nothing was switched', () => {
    expect(switchState(row(), null, 'OFF')).toBe('off')
    expect(switchState(row(), null, 'ON')).toBe('on')
  })

  it('holds a switch while the files keep the fingerprint it was set on', () => {
    const on = row({ switch: 'ON', switchFingerprint: 'a'.repeat(64) })
    expect(switchState(on, null, 'OFF')).toBe('on')
    const off = row({ switch: 'OFF', switchFingerprint: 'a'.repeat(64) })
    expect(switchState(off, null, 'ON')).toBe('off')
  })

  it('drops a switch once the files change, so a changed skill goes off under Off by default @security-H3', () => {
    const changed = row({ switch: 'ON', switchFingerprint: 'b'.repeat(64) })
    expect(switchState(changed, null, 'OFF')).toBe('off')
  })

  it('runs nothing under Never, whatever was switched', () => {
    const on = row({ switch: 'ON', switchFingerprint: 'a'.repeat(64) })
    expect(switchState(on, null, 'NEVER')).toBe('off')
    expect(switchState(on, 'NEVER', 'ON')).toBe('off')
  })

  it('never lets a place be laxer than the organisation', () => {
    expect(switchState(row(), 'ON', 'OFF')).toBe('off')
  })
})
