import { describe, expect, it } from 'vitest'
import type { RoomLabel } from '../../events'
import { roomMonitor } from '../roomMonitor'
import { FRAME, FRAME_MS, noise, rumble, seeded, stepper } from './signals'

type Frame = { pcm: Int16Array; confidence: number }

/** Feeds frames at 32 ms each, every frame scored as the VAD would, and returns the labels in the order given. */
function labels(frames: (i: number) => Frame, count: number, options: { playingUntil?: number } = {}) {
  const room = stepper(roomMonitor)
  for (let i = 0; i < count; i++) {
    const t = i * FRAME_MS
    const { pcm, confidence } = frames(i)
    if (options.playingUntil !== undefined && t < options.playingUntil) {
      room.step({ kind: 'playback.frame', replyId: 'r1', pcm: new Int16Array(FRAME), t })
    }
    room.step({ kind: 'audio.frame', pcm, t })
    room.step({ kind: 'acoustic.vadScore', confidence, t })
  }
  return room.emitted.map(e => (e.kind === 'acoustic.room' ? { label: e.label, t: e.t } : null))
}

const seconds = (s: number) => Math.round((s * 1000) / FRAME_MS)
const random = seeded(7)
const quiet = (): Frame => ({ pcm: noise(FRAME, -62, random), confidence: 0.01 })
const fan = (): Frame => ({ pcm: noise(FRAME, -32, random), confidence: 0.01 })
const labelsOnly = (result: ReturnType<typeof labels>) => result.map(r => r?.label)

describe('the room monitor', () => {
  it('labels a quiet room quiet once it has heard one window', () => {
    const result = labels(quiet, seconds(3))
    expect(labelsOnly(result)).toEqual<RoomLabel[]>(['quiet'])
    expect(result[0]!.t).toBe(2_016)
  })

  it('labels a fan steady noise', () => {
    expect(labelsOnly(labels(fan, seconds(3)))).toEqual(['steady-noise'])
  })

  it('labels typing, loud bursts over a quiet room, intermittent noise', () => {
    // A keystroke of 32 ms every quarter of a second.
    const typing = (i: number): Frame => (i % 8 === 0 ? { pcm: noise(FRAME, -24, random), confidence: 0.03 } : quiet())
    expect(labelsOnly(labels(typing, seconds(3)))).toEqual(['intermittent-noise'])
  })

  it('labels a loud low rumble that swells and falls wind', () => {
    expect(labelsOnly(labels(i => ({ pcm: rumble(FRAME, -24, i * FRAME), confidence: 0.02 }), seconds(3)))).toEqual(['wind'])
  })

  it('labels a voice heard all the time, further away than the person, other voices', () => {
    const talkShow = (): Frame => ({ pcm: noise(FRAME, -46, random), confidence: 0.95 })
    expect(labelsOnly(labels(talkShow, seconds(9)))).toEqual(['other-voices'])
  })

  it('does not take the person talking at length, close to the microphone, for other voices', () => {
    // Speech with a short gap in each second, as between phrases.
    const talking = (i: number): Frame =>
      i % 31 < 2 ? quiet() : { pcm: noise(FRAME, -24, random), confidence: 0.97 }
    expect(labelsOnly(labels(talking, seconds(12)))).not.toContain('other-voices')
  })

  it('changes the label only when the next two readings agree', () => {
    const fanFrom = (from: number) => (i: number) => (i < from ? quiet() : fan())
    // The fan comes on at 4 s: the readings at 6 s and 8 s are both steady noise, so the label changes at 8 s.
    const result = labels(fanFrom(seconds(4)), seconds(9))
    expect(labelsOnly(result)).toEqual(['quiet', 'steady-noise'])
    expect(result[1]!.t).toBeGreaterThanOrEqual(7_900)
    // A single loud window does not change it.
    const blip = labels(i => (i >= seconds(4) && i < seconds(6) ? fan() : quiet()), seconds(12))
    expect(labelsOnly(blip)).toEqual(['quiet'])
  })

  it('leaves out what it hears while the agent speaks, so the agent’s voice is not taken for other voices', () => {
    const agent = (): Frame => ({ pcm: noise(FRAME, -40, random), confidence: 0.9 })
    const result = labels(i => (i < seconds(9) ? agent() : quiet()), seconds(12), { playingUntil: 9_000 })
    expect(labelsOnly(result)).toEqual(['quiet'])
  })
})
