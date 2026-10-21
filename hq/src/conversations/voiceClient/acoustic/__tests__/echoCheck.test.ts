import { describe, expect, it } from 'vitest'
import { echoCheck } from '../echoCheck'
import { VOICE_SETTINGS } from '../../settings'
import { FRAME, FRAME_MS, noise, RATE, seeded, stepper } from './signals'

/** Speech-like audio: noise whose loudness rises and falls a few times a second, as syllables do. */
function syllables(ms: number, db: number, seed: number): Int16Array {
  const random = seeded(seed)
  const base = noise(Math.round((ms * RATE) / 1000), db, random)
  let gain = 0
  let next = 0
  return base.map((s, i) => {
    if (i >= next) { gain = random() > -0.2 ? 0.2 + 0.8 * Math.abs(random()) : 0.02; next = i + 1_200 + Math.floor(Math.abs(random()) * 2_400) }
    return Math.round(s * gain)
  })
}

const delayed = (pcm: Int16Array, ms: number) => {
  const by = Math.round((ms * RATE) / 1000)
  const out = new Int16Array(pcm.length)
  out.set(pcm.subarray(0, pcm.length - by), by)
  return out
}

const mix = (...parts: Array<[Int16Array, number]>) =>
  Int16Array.from({ length: parts[0]![0].length }, (_, i) => Math.round(parts.reduce((sum, [pcm, gain]) => sum + pcm[i]! * gain, 0)))

/** Plays `agent` to the speaker and `mic` into the microphone, frame by frame, and returns the echo levels. */
function levels(agent: Int16Array | null, mic: Int16Array) {
  const check = stepper(echoCheck)
  for (let at = 0, t = 0; at + FRAME <= mic.length; at += FRAME, t += FRAME_MS) {
    if (agent) check.step({ kind: 'playback.frame', replyId: 'r1', pcm: agent.slice(at, at + FRAME), t })
    check.step({ kind: 'audio.frame', pcm: mic.slice(at, at + FRAME), t })
  }
  return check.emitted.flatMap(e => (e.kind === 'acoustic.echoLevel' ? [e.level] : []))
}

const agent = syllables(6_000, -20, 3)
const person = syllables(6_000, -24, 11)
const room = noise(agent.length, -65, seeded(5))

describe('the echo check', () => {
  it('reports a high level when the microphone hears the agent’s voice back, a little later', () => {
    const heard = levels(agent, mix([delayed(agent, 120), 0.3], [room, 1]))
    expect(heard.length).toBeGreaterThan(10)
    expect(Math.min(...heard)).toBeGreaterThan(0.7)
  })

  it('reports a low level when the microphone hears only the person', () => {
    const heard = levels(agent, mix([person, 1], [room, 1]))
    expect(Math.max(...heard)).toBeLessThan(0.3)
  })

  it('reports a level between the two when the person speaks over an echo about as loud as they are', () => {
    const heard = levels(agent, mix([delayed(agent, 120), 0.5], [person, 1], [room, 1]))
    const typical = [...heard].sort((a, b) => a - b)[Math.floor(heard.length / 2)]!
    expect(typical).toBeGreaterThan(0.1)
    expect(typical).toBeLessThan(0.7)
  })

  it('reports no echo when the device cancelled it, and the microphone hears next to nothing', () => {
    const heard = levels(agent, mix([delayed(agent, 120), 0.0005], [room, 0.05]))
    expect(heard.every(level => level === 0)).toBe(true)
  })

  it('reads only while the agent speaks, once a reading’s worth of audio is heard', () => {
    expect(levels(null, mix([person, 1], [room, 1]))).toEqual([])
    const heard = levels(agent, mix([delayed(agent, 120), 0.3], [room, 1]))
    const readings = Math.floor(6_000 / VOICE_SETTINGS.echo.readingMs)
    expect(heard.length).toBeLessThanOrEqual(readings)
    expect(heard.length).toBeGreaterThanOrEqual(readings - 6)
  })
})
