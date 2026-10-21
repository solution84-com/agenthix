import { describe, expect, it } from 'vitest'
import type { DetectorSettingsInUse, RoomLabel, VoiceEventBody, VoiceEventInput } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { detectorAdapter } from '../adapter'
import { stepper } from './signals'

const QUIET: DetectorSettingsInUse = VOICE_SETTINGS.detector
const STRICT: DetectorSettingsInUse = { ...QUIET, onThreshold: 0.7, minVoiceMs: 250 }

function setup() {
  const adapter = stepper(detectorAdapter)
  let t = 0
  const at = (ms: number) => { t = ms }
  const step = (event: VoiceEventBody) => adapter.step({ ...event, t } as VoiceEventInput)
  const detectors = () => adapter.emitted.flatMap(e => (e.kind === 'acoustic.detector' ? [e.detector] : []))
  const reasons = () => adapter.emitted.flatMap(e => (e.kind === 'acoustic.detector' ? [e.reason] : []))
  const playing = (playing: boolean) => step({ kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: !playing, playing })
  const echo = (level: number) => step({ kind: 'acoustic.echoLevel', level })
  const room = (label: RoomLabel) => step({ kind: 'acoustic.room', label })
  const tick = () => step({ kind: 'clock.tick' })
  /** A short burst of voice, as a keystroke the detector took for voice: silence: no, then yes 300 ms later. */
  const burst = (from: number) => {
    at(from + 300)
    adapter.step({ kind: 'acoustic.silence', silent: false, t: from })
    adapter.step({ kind: 'acoustic.silence', silent: true, t: from + 300 })
  }
  return { adapter, at, step, detectors, reasons, playing, echo, room, tick, burst }
}

describe('the Adapter', () => {
  it('makes the detector strict while the agent speaks and its echo is not yet measured, and normal after', () => {
    const a = setup()
    a.playing(true)
    a.at(2_000); a.playing(false)
    expect(a.detectors()).toEqual([STRICT, QUIET])
    expect(a.reasons()[0]).toMatch(/agent/)
  })

  it('keeps the detector normal while the agent speaks on a device that cancels its echo well', () => {
    const a = setup()
    a.echo(0.05)
    a.playing(true)
    expect(a.detectors()).toEqual([])
  })

  it('goes strict when the echo level rises above the strict level while the agent speaks, and back when it falls', () => {
    const a = setup()
    a.echo(0.05)
    a.playing(true)
    a.at(500); a.echo(VOICE_SETTINGS.echo.strictAbove + 0.1)
    a.at(1_000); a.echo(0.05)
    expect(a.detectors()).toEqual([STRICT, QUIET])
  })

  it('asks for a longer minimum voice in intermittent noise', () => {
    const a = setup()
    a.room('intermittent-noise')
    expect(a.detectors()).toHaveLength(1)
    expect(a.detectors()[0]!.minVoiceMs).toBeGreaterThan(QUIET.minVoiceMs)
    expect(a.reasons()[0]).toMatch(/intermittent/)
  })

  it('keeps a room change that cut the short bursts the detector took for voice', () => {
    const a = setup()
    for (let s = 0; s < 10; s++) a.burst(1_000 + s * 1_500)
    a.at(20_000); a.room('intermittent-noise')
    a.burst(25_000)
    a.at(20_000 + VOICE_SETTINGS.adapter.trialMs); a.tick()
    expect(a.detectors()).toHaveLength(1)
  })

  it('puts a room change back when the bursts did not fall, and does not try it again in the same room', () => {
    const a = setup()
    for (let s = 0; s < 4; s++) a.burst(1_000 + s * 4_000)
    a.at(20_000); a.room('intermittent-noise')
    for (let s = 0; s < 4; s++) a.burst(21_000 + s * 4_000)
    a.at(20_000 + VOICE_SETTINGS.adapter.trialMs); a.tick()
    expect(a.detectors()).toEqual([expect.objectContaining({ minVoiceMs: expect.any(Number) }), QUIET])
    expect(a.reasons()[1]).toMatch(/put back/)
    a.at(45_000); a.room('intermittent-noise')
    expect(a.detectors()).toHaveLength(2)
  })

  it('tries the change again once the room has been something else', () => {
    const a = setup()
    for (let s = 0; s < 4; s++) a.burst(1_000 + s * 4_000)
    a.at(20_000); a.room('intermittent-noise')
    for (let s = 0; s < 4; s++) a.burst(21_000 + s * 4_000)
    a.at(20_000 + VOICE_SETTINGS.adapter.trialMs); a.tick()
    a.at(45_000); a.room('quiet')
    a.at(50_000); a.room('intermittent-noise')
    expect(a.detectors()).toHaveLength(3)
  })

  it('combines the room’s change with the strict settings while the agent speaks', () => {
    const a = setup()
    a.room('intermittent-noise')
    a.playing(true)
    const [, both] = a.detectors()
    expect(both!.onThreshold).toBe(STRICT.onThreshold)
    expect(both!.minVoiceMs).toBeGreaterThanOrEqual(STRICT.minVoiceMs)
  })
})
