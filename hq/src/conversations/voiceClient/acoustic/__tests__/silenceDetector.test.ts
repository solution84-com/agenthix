import { describe, expect, it } from 'vitest'
import type { DetectorSettingsInUse, VoiceEvent, VoiceEventInput } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { FRAME_MS, silenceDetector } from '../silenceDetector'
import { FRAME, noise, seeded, stepper } from './signals'

/** Runs the component over one confidence a frame, frame `i` at `i * FRAME_MS`, and returns what it emitted. */
function run(confidences: number[], detector?: DetectorSettingsInUse, at = 0) {
  let state = silenceDetector.init(VOICE_SETTINGS)
  const emitted: VoiceEventInput[] = []
  let seq = 0
  const step = (event: VoiceEventInput) => {
    const result = silenceDetector.step(state, { ...event, seq: seq++ } as VoiceEvent, VOICE_SETTINGS)
    state = result.state
    emitted.push(...result.emit)
  }
  if (detector) step({ kind: 'acoustic.detector', detector, reason: 'test', t: at })
  confidences.forEach((confidence, i) => step({ kind: 'acoustic.vadScore', confidence, t: at + i * FRAME_MS }))
  return emitted.map(e => e.kind === 'acoustic.silence' ? { silent: e.silent, t: e.t } : null)
}

const frames = (n: number, confidence: number) => Array.from({ length: n }, () => confidence)
const STRICT: DetectorSettingsInUse = { onThreshold: 0.7, offThreshold: 0.35, minVoiceMs: 300, minSilenceMs: 150 }

describe('silence detection', () => {
  it('says silence: no once voice has lasted the minimum voice, timed from where the voice began', () => {
    // 250 ms is 8 frames of 32 ms: the eighth voiced frame decides.
    expect(run([...frames(5, 0.05), ...frames(7, 0.9)])).toEqual([])
    expect(run([...frames(5, 0.05), ...frames(8, 0.9)])).toEqual([{ silent: false, t: 5 * FRAME_MS }])
  })

  it('does not count a cough or a click shorter than the minimum voice', () => {
    expect(run([...frames(3, 0.9), ...frames(10, 0.05), ...frames(4, 0.9), ...frames(10, 0.05)])).toEqual([])
  })

  it('says silence: yes once silence has lasted the minimum silence, timed from where it began', () => {
    // 150 ms is 5 frames.
    const said = run([...frames(10, 0.9), ...frames(4, 0.1), ...frames(3, 0.9), ...frames(5, 0.1)])
    expect(said).toEqual([{ silent: false, t: 0 }, { silent: true, t: 17 * FRAME_MS }])
  })

  it('keeps voice on through confidences between the off and on thresholds, so it does not flicker mid-word', () => {
    const said = run([...frames(10, 0.9), ...frames(20, 0.4), ...frames(5, 0.2)])
    expect(said).toEqual([{ silent: false, t: 0 }, { silent: true, t: 30 * FRAME_MS }])
  })

  it('does not start voice on confidences between the thresholds', () => {
    expect(run(frames(30, 0.45))).toEqual([])
  })

  it('uses the detector settings the Adapter last published', () => {
    // 0.6 is voice at the starting settings, and not at the strict ones.
    expect(run(frames(12, 0.6))).toEqual([{ silent: false, t: 0 }])
    expect(run(frames(12, 0.6), STRICT)).toEqual([])
    // At 0.8, the strict minimum voice of 300 ms takes 10 frames, not 8.
    expect(run(frames(9, 0.8), STRICT)).toEqual([])
    expect(run(frames(10, 0.8), STRICT)).toEqual([{ silent: false, t: 0 }])
  })

  it('ends a voice in progress when the person mutes, and says nothing when there is none', () => {
    const s = stepper(silenceDetector)
    s.step({ kind: 'stt.muted', muted: true, t: 0 })
    expect(s.emitted).toEqual([])
    frames(10, 0.9).forEach((confidence, i) => s.step({ kind: 'acoustic.vadScore', confidence, t: i * FRAME_MS }))
    s.step({ kind: 'stt.muted', muted: true, t: 400 })
    expect(s.emitted.map(e => e.kind === 'acoustic.silence' && { silent: e.silent, t: e.t })).toEqual([{ silent: false, t: 0 }, { silent: true, t: 400 }])
  })
})

describe('silence detection’s level gates', () => {
  const loud = (pcm: Int16Array, gain: number) => pcm.map(s => Math.round(s * gain))
  const random = seeded(9)

  /** Frame by frame: what playback sent (or nothing), what the microphone heard, and Silero's confidence. */
  function heard(frames: Array<{ played: Int16Array | null; mic: Int16Array; confidence: number }>, room?: 'other-voices') {
    const detector = stepper(silenceDetector)
    if (room) detector.step({ kind: 'acoustic.room', label: room, t: 0 })
    frames.forEach(({ played, mic, confidence }, i) => {
      const t = i * FRAME_MS
      if (played) detector.step({ kind: 'playback.frame', replyId: 'r1', pcm: played, t })
      detector.step({ kind: 'audio.frame', pcm: mic, t })
      detector.step({ kind: 'acoustic.vadScore', confidence, t })
    })
    return detector.emitted.flatMap(e => (e.kind === 'acoustic.silence' ? [{ silent: e.silent, t: e.t }] : []))
  }

  it('does not take the agent’s echo for the person, however sure Silero is that it is a voice', () => {
    const frames = Array.from({ length: 150 }, () => {
      const played = noise(FRAME, -20, random)
      return { played, mic: loud(played, 0.3), confidence: 0.99 }
    })
    expect(heard(frames)).toEqual([])
  })

  it('hears the person speaking over the echo, louder than it', () => {
    const frames = Array.from({ length: 150 }, (_, i) => {
      const played = noise(FRAME, -20, random)
      const person = i >= 100 ? noise(FRAME, -20, random) : new Int16Array(FRAME)
      return { played, mic: Int16Array.from(played, (s, j) => Math.round(s * 0.3 + person[j]!)), confidence: 0.99 }
    })
    expect(heard(frames)).toEqual([{ silent: false, t: 100 * FRAME_MS }])
  })

  it('with other voices in the room, counts only a voice well above the room’s own level', () => {
    const background = () => noise(FRAME, -46, random)
    const frames = Array.from({ length: 400 }, (_, i) => ({
      played: null,
      mic: i >= 250 && i < 300 ? noise(FRAME, -30, random) : background(),
      confidence: 0.97,
    }))
    expect(heard(frames, 'other-voices')).toEqual([{ silent: false, t: 250 * FRAME_MS }, { silent: true, t: 300 * FRAME_MS }])
    // Without the label, the talk show is voice all along.
    expect(heard(frames)).toEqual([{ silent: false, t: 0 }])
  })
})
