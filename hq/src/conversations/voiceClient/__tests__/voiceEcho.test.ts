/**
 * The agent's own voice, heard back through the speakers with nobody speaking, through the whole of voice
 * (adaptive voice spec, the launch minimum: the agent's own voice never becomes the person's words). The
 * microphone hears playback at a third of its level, which Silero scores as voice (0.99, as measured on the owner's
 * recordings); the words are the speech service's, recorded hearing that reply (`fixtures/assemblyai-echo.jsonl`).
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readProviderRecording, wordsOf } from './harness/recording'
import { FRAME_SAMPLES } from './harness/replay'
import { rig } from './sessionRig'

const SENTENCES = [
  'Right now your plate is the walkthrough, the morning check, and two tasks due today.',
  'A second of lag is about what you should expect from the speech service.',
]

/** A steady sound with the rise and fall of speech, `amp` loud. */
function speechLike(samples: number, amp: number, from: number): Int16Array {
  const out = new Int16Array(samples)
  for (let i = 0; i < samples; i++) {
    const n = from + i
    out[i] = Math.round(32767 * amp * Math.sin(n / 7) * (0.6 + 0.4 * Math.sin(n / 1600)))
  }
  return out
}

describe('the agent heard back, nobody speaking @SC-1002', () => {
  it('never ducks or stops the reply, and none of it becomes the person’s words or a message', async () => {
    const r = rig({ service: 'plain', vad: frame => (frame.some(x => x !== 0) ? 0.99 : 0.02) })
    // The recording heard the agent with five seconds of lag; here its words come as the agent is heard.
    const recorded = readProviderRecording(join(__dirname, 'fixtures', 'assemblyai-echo.jsonl'))
      .map(m => ({ at: m.at - 5_000, words: wordsOf(m.msg) }))
      .filter(m => m.words && m.at > 0)
    await r.start()
    let played = 0
    r.pb.state.played = () => { const out = speechLike(800, 0.1, played); played += 800; return out }
    r.reply('t1', SENTENCES)
    const from = r.clock.now()
    for (const m of recorded) r.clock.after(m.at, () => r.fake.say(m.words!.text, m.words!.words, m.words!.committed, m.words!.order))
    let heard = 0
    for (let at = 0; at < 8_000; at += 32) {
      r.pb.state.head = { index: at < 4_500 ? 0 : 1, elapsed: (at % 4_500) / 1000, ended: false }
      await r.hear(speechLike(FRAME_SAMPLES, 0.03, heard))
      heard += FRAME_SAMPLES
    }
    r.replyEnds('t1', 2)
    await r.silence(3_000)
    expect(r.clock.now() - from).toBeGreaterThan(10_000)
    expect(r.of('stt.words').length).toBeGreaterThan(0)
    expect(r.of('orchestration.playback')).toEqual([])
    expect(r.interrupts()).toEqual([])
    expect(r.of('stt.person').filter(e => e.text)).toEqual([])
    expect(r.sent()).toEqual([])
  })
})
