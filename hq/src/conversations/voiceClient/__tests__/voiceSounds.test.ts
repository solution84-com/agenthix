import { describe, expect, it } from 'vitest'
import { soundOf } from '../voiceSounds'

const at = (phase: 'off' | 'starting' | 'listening' | 'thinking' | 'speaking', more: { muted?: boolean; reconnecting?: boolean } = {}) =>
  ({ phase, muted: more.muted ?? false, reconnecting: more.reconnecting ?? false })

describe('the sounds of a call @SC-1928', () => {
  it('sounds on once voice can first hear the person, and off when it ends', () => {
    expect(soundOf(at('off'), at('starting'))).toBeNull()
    expect(soundOf(at('starting'), at('listening'))).toBe('on')
    expect(soundOf(at('listening'), at('off'))).toBe('off')
    expect(soundOf(at('speaking'), at('off'))).toBe('off')
  })

  it('sounds mute and unmute, and a lost connection and its return', () => {
    expect(soundOf(at('listening'), at('listening', { muted: true }))).toBe('mute')
    expect(soundOf(at('listening', { muted: true }), at('listening'))).toBe('unmute')
    expect(soundOf(at('listening'), at('listening', { reconnecting: true }))).toBe('lost')
    expect(soundOf(at('listening', { reconnecting: true }), at('listening'))).toBe('on')
  })

  it('is quiet as the turn comes back to the person, and while the agent speaks', () => {
    expect(soundOf(at('speaking'), at('listening'))).toBeNull()
    expect(soundOf(at('listening'), at('thinking'))).toBeNull()
    expect(soundOf(at('speaking'), at('speaking', { muted: true }))).toBeNull()
  })
})
