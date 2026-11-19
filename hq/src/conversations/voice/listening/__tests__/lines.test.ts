/**
 * A light model's line sent in parts as its speech streams in (adaptive voice listening, spec §How its words are played):
 * the first part once it holds enough audio with a voice in it, each later part as it adds a voice, numbered, the last
 * marked `end`; the quiet the speech service leaves after the line is not sent. A failure part way ends the line where
 * it got to; one before any part was sent leaves nothing to hear.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../billing/sources/voice', () => ({ recordTts: vi.fn() }))
vi.mock('../../reportedSpeech', () => ({ reported: (_id: string, stream: AsyncIterable<unknown>) => stream }))
vi.mock('../../phrases', () => ({ holdPhraseClip: vi.fn(), spokenAs: (t: string) => `[relaxed, low voice, thinking] ${t}` }))
const said = vi.hoisted(() => [] as string[])
vi.mock('../../../../voice/inworldAdapter', () => ({
  inworldTtsAdapter: { async *synthesizeStream(text: string) { said.push(text); yield { audio: new Uint8Array(48) } } },
}))

import type { VoiceLineEvent } from '@agenthix/core'
import type { AgentVoice } from '../../speech'
import { lineParts } from '../lineParts'
import { lineDeps, speakLine, type LineDeps } from '../lines'

/** `ms` of 24 kHz PCM16: a voice (a square wave well over the quiet level), or silence. */
const pcm = (ms: number, loud: boolean) => {
  const b = Buffer.alloc(Math.round(ms * 24) * 2)
  if (loud) for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(i % 2 ? 8000 : -8000, i * 2)
  return b
}
const msOf = (b: Buffer | ArrayBuffer | Uint8Array) => b.byteLength / 48

function run(pieces: Array<Buffer | Error>) {
  const sent: VoiceLineEvent[] = []
  const failed = vi.fn()
  const deps: LineDeps = {
    async *synthesize() {
      for (const p of pieces) {
        await Promise.resolve()
        if (p instanceof Error) throw p
        yield p
      }
    },
    stored: vi.fn(),
    toHolder: (_e, payload) => { sent.push(payload) },
    failed,
  }
  const lineId = speakLine('c1', {} as AgentVoice, 'Let me check.', deps)
  return { lineId, sent, failed, settled: () => new Promise(resolve => setTimeout(resolve, 5)) }
}

describe('a line in parts @SC-2208', () => {
  it('sends the first part once it holds 200 ms with a voice, then each part as it comes, numbered, the last marked end, without the quiet after it', async () => {
    const s = run([pcm(30, false), pcm(400, true), pcm(100, false), pcm(300, true), pcm(900, false)])
    await s.settled()
    expect(s.sent.map(e => e.index)).toEqual(s.sent.map((_, i) => i))
    expect(s.sent.map(e => e.end ?? false)).toEqual([...s.sent.slice(1).map(() => false), true])
    expect(msOf(s.sent[0]!.audio)).toBeGreaterThanOrEqual(200)
    // All of it up to the last voice, and 80 ms after, to within the 20 ms the voice is read in: the 900 ms of quiet at
    // the end is not sent.
    const total = s.sent.reduce((ms, e) => ms + msOf(e.audio), 0)
    expect(total).toBeGreaterThanOrEqual(30 + 400 + 100 + 300 + 80)
    expect(total).toBeLessThanOrEqual(30 + 400 + 100 + 300 + 80 + 20)
    expect(new Set(s.sent.map(e => e.lineId))).toEqual(new Set([s.lineId]))
    expect(s.failed).not.toHaveBeenCalled()
  })

  it('a line whose speech is all here before 200 ms of it: one part, its quiet after trimmed', async () => {
    const s = run([pcm(150, true)])
    await s.settled()
    expect(s.sent.map(e => [e.index, e.end ?? false, msOf(e.audio)])).toEqual([[0, true, 150]])
    const t = run([pcm(100, true), pcm(50, false)])
    await t.settled()
    expect(t.sent.map(e => [e.index, e.end ?? false, msOf(e.audio)])).toEqual([[0, true, 150]])
  })

  it('a failure part way: what was sent ends there, and stays heard', async () => {
    const s = run([pcm(400, true), new Error('stream closed')])
    await s.settled()
    expect(s.sent.map(e => [e.index, e.end ?? false, msOf(e.audio)])).toEqual([[0, false, 400], [1, true, 0]])
    expect(s.failed).toHaveBeenCalledWith(s.lineId, expect.any(Error), true)
  })

  it('a failure before any part, or no audio at all: nothing is sent, and the line is not heard', async () => {
    for (const pieces of [[new Error('refused')], []]) {
      const s = run(pieces)
      await s.settled()
      expect(s.sent).toEqual([])
      expect(s.failed).toHaveBeenCalledWith(s.lineId, expect.any(Error), false)
    }
  })
})

describe('the direction a line is made in', () => {
  it('none: the light model\'s own line is spoken plainly, in the agent\'s ordinary voice, as its replies', async () => {
    const deps = lineDeps('c1', () => undefined, () => undefined)
    for await (const piece of deps.synthesize('Let me check Melbourne\'s forecast.', { model: 'inworld-tts-2' } as AgentVoice)) void piece
    expect(said).toEqual(["Let me check Melbourne's forecast."])
  })
})

describe('the parts of a line', () => {
  it('holds a part that is only quiet, and sends it ahead of the next voice, so a pause between words is kept', () => {
    const parts = lineParts()
    expect(parts.take(pcm(300, true))).not.toBeNull()
    expect(parts.take(pcm(200, false))).toBeNull()
    expect(msOf(parts.take(pcm(100, true))!)).toBe(300)
    expect(msOf(parts.end())).toBe(0)
  })
})
