import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { echoFilter } from '../echoFilter'
import type { VoiceEventInput, VoiceEventOf } from '../../events'

const SAID = 'Right now your plate is Walkthrough, the morning check, and two tasks due today.'

function setup() {
  const clock = fakeClock()
  const runtime = createVoiceRuntime({ components: [echoFilter], adapters: [], settings: VOICE_SETTINGS, clock })
  const heard: VoiceEventOf<'stt.heard'>[] = []
  runtime.subscribe(['stt.heard'], e => heard.push(e))
  const send = (e: VoiceEventInput) => runtime.publish(e)
  /** The reply's sentence `index` playing from `from` to `to`, ticked as the session ticks. */
  const playing = (replyId: string, index: number, from: number, to: number) => {
    for (let t = from; t <= to; t += 50) send({ kind: 'playback.at', replyId, index, elapsedMs: t - from, ended: false, playing: true, t })
  }
  const words = (text: string, t: number, at: number, committed = false) => {
    const timed = text.split(' ').map((w, i) => ({ text: w, startAt: at + i * 300, endAt: at + i * 300 + 200 }))
    send({ kind: 'stt.words', text, words: timed, committed, order: 0, t })
    return heard.at(-1)!
  }
  return { send, playing, words, heard }
}

describe('the echo filter @SC-997', () => {
  it('sets aside the agent’s words heard back while its sentence plays', () => {
    const c = setup()
    c.send({ kind: 'reply.sentence', replyId: 'r1', index: 0, text: SAID, t: 0 })
    c.playing('r1', 0, 0, 5_000)
    expect(c.words('your plate is walkthrough', 6_000, 1_000)).toMatchObject({ text: '', words: 0, dropped: { echo: 4 } })
  })

  it('passes the person’s words on whole, with the transcript and its timing', () => {
    const c = setup()
    const e = c.words('Book the room.', 1_000, 0, true)
    expect(e).toMatchObject({ heard: 'Book the room.', text: 'Book the room.', words: 3, committed: true, order: 0 })
    expect(e.timed).toHaveLength(3)
  })

  it('only knows a sentence as the agent’s once its audio is heard', () => {
    const c = setup()
    c.send({ kind: 'reply.sentence', replyId: 'r1', index: 0, text: SAID, t: 0 })
    expect(c.words('your plate is walkthrough', 2_000, 1_000).text).toBe('your plate is walkthrough')
  })

  it('forgets the sentences of a reply once the next reply’s first sentence comes', () => {
    const c = setup()
    c.send({ kind: 'reply.sentence', replyId: 'r1', index: 0, text: SAID, t: 0 })
    c.send({ kind: 'reply.sentence', replyId: 'r2', index: 1, text: 'Something else entirely.', t: 10 })
    // r1's sentence 0 is gone: hearing index 0 of r2 knows no text, so nothing it says is the agent's.
    c.playing('r2', 0, 100, 5_000)
    expect(c.words('your plate is walkthrough', 6_000, 1_000).text).toBe('your plate is walkthrough')
  })

  it('forgets a reply’s sentences once its playback stops, even when more of the same reply comes', () => {
    const c = setup()
    c.send({ kind: 'reply.sentence', replyId: 'r1', index: 0, text: SAID, t: 0 })
    c.send({ kind: 'playback.at', replyId: 'r1', index: -1, elapsedMs: 0, ended: false, playing: false, t: 10 })
    c.send({ kind: 'reply.sentence', replyId: 'r1', index: 1, text: 'Something else entirely.', t: 20 })
    c.playing('r1', 0, 100, 5_000)
    expect(c.words('your plate is walkthrough', 6_000, 1_000).text).toBe('your plate is walkthrough')
  })

  it('sets aside a filler phrase heard back, as the agent’s own', () => {
    const c = setup()
    for (let t = 0; t <= 800; t += 50) c.send({ kind: 'phrase.at', text: 'Mm, let me see.', playing: true, t })
    c.send({ kind: 'phrase.at', text: 'Mm, let me see.', playing: false, t: 850 })
    expect(c.words('let me see', 1_500, 200)).toMatchObject({ text: '', dropped: { echo: 3 } })
  })
})
