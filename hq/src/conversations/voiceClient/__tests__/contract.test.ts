import { describe, expect, it } from 'vitest'
import { fakeClock } from '../clock'
import { loopOf } from '../events'
import { VOICE_SETTINGS } from '../settings'

describe('the fake clock', () => {
  it('runs timers in time order as it advances, in the order they were made when due together', () => {
    const clock = fakeClock(1_000)
    const ran: string[] = []
    clock.after(300, () => ran.push(`after@${clock.now()}`))
    const tick = clock.every(100, () => ran.push(`every@${clock.now()}`))
    clock.advance(250)
    expect(ran).toEqual(['every@1100', 'every@1200'])
    clock.advance(100)
    expect(ran).toEqual(['every@1100', 'every@1200', 'after@1300', 'every@1300'])
    tick.cancel()
    clock.advance(1_000)
    expect(ran).toHaveLength(4)
    expect(clock.now()).toBe(2_350)
  })
})

describe('the loops', () => {
  it('puts what the person said inbound, decisions in the decision loop, and the reply outbound', () => {
    expect(loopOf('audio.frame')).toBe('inbound')
    expect(loopOf('stt.words')).toBe('inbound')
    expect(loopOf('acoustic.silence')).toBe('inbound')
    expect(loopOf('semantics.decision')).toBe('decision')
    expect(loopOf('orchestration.send')).toBe('decision')
    expect(loopOf('orchestration.playback')).toBe('outbound')
    expect(loopOf('reply.audio')).toBe('outbound')
    expect(loopOf('playback.frame')).toBe('outbound')
  })
})

describe('the settings', () => {
  it('asks the turn model at marks the decision rule covers, before the cap', () => {
    const { marksMs, rule, capMs } = VOICE_SETTINGS.pause
    expect(rule.map(r => r.atMs)).toEqual(marksMs)
    expect(Math.max(...marksMs)).toBeLessThan(capMs)
    expect(VOICE_SETTINGS.detector.offThreshold).toBeLessThan(VOICE_SETTINGS.detector.onThreshold)
  })
})
