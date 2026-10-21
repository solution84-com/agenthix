import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { VoiceEventInput } from '../../events'
import type { Adapter, Component } from '../../runtime/types'
import { fakeClock } from '../../clock'
import { fakeTurnModel, fakeVoiceActivityModel } from './fakeModels'
import { fakeSpeechToText } from './fakeSpeechToText'
import { readProviderRecording, wordsOf } from './recording'
import { FRAME_MS, FRAME_SAMPLES, replay, type ReplayEnv } from './replay'
import { concat, encodeWav, parseWav, readWavFile, silence, tone } from './wav'

const FIXTURES = join(__dirname, '..', 'fixtures')

/** A tiny speech adapter: sends the audio frames to the fake service and turns its words into `stt.words` events. */
const sttAdapter = (speech: ReplayEnv['speech']): Adapter => ({
  name: 'test-stt',
  start: (runtime) => {
    let connection: Awaited<ReturnType<typeof speech.connect>> | null = null
    const zero = runtime.now()
    speech.connect({
      onWords: (text, words, committed, order) => runtime.publish({
        kind: 'stt.words', text, committed, order, t: runtime.now(),
        words: words.map(w => ({ text: w.text, startAt: zero + w.start, endAt: zero + w.end })),
      }),
      onClose: reason => runtime.publish({ kind: 'stt.status', state: 'reconnecting', reason, t: runtime.now() }),
      onError: reason => runtime.publish({ kind: 'stt.status', state: 'failed', reason, t: runtime.now() }),
    }).then(c => { connection = c })
    const off = runtime.subscribe(['audio.frame'], e => { if (e.kind === 'audio.frame') connection?.send(e.pcm) })
    return () => { off(); connection?.close() }
  },
})

/** A tiny component: counts committed words and says so when a turn is committed. */
const committer: Component<{ turns: number }> = {
  name: 'committer',
  accepts: ['stt.words'],
  init: () => ({ turns: 0 }),
  step: (state, event) => {
    if (event.kind !== 'stt.words' || !event.committed) return { state, emit: [] }
    const emit: VoiceEventInput[] = [{ kind: 'orchestration.send', text: event.text, append: false, t: event.t }]
    return { state: { turns: state.turns + 1 }, emit }
  },
}

describe('the WAV reader', () => {
  it('reads what it wrote, and the committed fixture', () => {
    const samples = tone(100)
    expect(Array.from(parseWav(encodeWav(samples)))).toEqual(Array.from(samples))
    const file = readWavFile(join(FIXTURES, 'tone-and-silence.wav'))
    expect(file.length).toBe(16_000)
    expect(Math.max(...file.slice(0, 4_000))).toBeGreaterThan(1_000)
    expect(Math.max(...file.slice(8_000))).toBe(0)
  })

  it('refuses anything but 16 kHz mono PCM16', () => {
    const bytes = encodeWav(tone(10))
    new DataView(bytes.buffer).setUint32(24, 44_100, true)
    expect(() => parseWav(bytes)).toThrow(/16 kHz/)
    expect(() => parseWav(new Uint8Array(10))).toThrow(/not a WAV/)
    const stereo = encodeWav(tone(10))
    new DataView(stereo.buffer).setUint16(22, 2, true)
    expect(() => parseWav(stereo)).toThrow(/mono/)
  })
})

describe('the replay', () => {
  it('feeds 512-sample frames at the pace of the audio', async () => {
    const audio = concat(tone(320), silence(320))
    const result = await replay({ components: [], audio, tailMs: 0 })
    const frames = result.of('audio.frame')
    expect(frames).toHaveLength(Math.floor(audio.length / FRAME_SAMPLES))
    expect(frames.every(f => f.pcm.length === FRAME_SAMPLES)).toBe(true)
    expect(frames.map(f => f.t).slice(0, 3)).toEqual([FRAME_MS, 2 * FRAME_MS, 3 * FRAME_MS])
    expect(result.between('audio.frame', e => e.kind === 'audio.frame' && e.t === 10 * FRAME_MS)).toBe(9 * FRAME_MS)
  })

  it('replays a recorded provider session into stt.words, at the recorded times, and on to the components', async () => {
    const messages = readProviderRecording(join(FIXTURES, 'assemblyai-force-endpoint.jsonl'))
    const turns = messages.filter(m => m.msg.type === 'Turn')
    const result = await replay({
      components: [committer], adapters: ({ speech }) => [sttAdapter(speech)], messages, tailMs: 100,
    })
    const words = result.of('stt.words')
    expect(words).toHaveLength(turns.length)
    expect(words.map(w => w.t)).toEqual(turns.map(m => m.at))
    expect(words[0]!.text).toBe(wordsOf(turns[0]!.msg)!.text)
    const committed = words.filter(w => w.committed)
    expect(committed.length).toBeGreaterThan(0)
    expect(result.of('orchestration.send').map(e => e.text)).toEqual(committed.map(w => w.text))
    const firstWord = words[0]!.words[0]!
    expect(firstWord.endAt).toBeGreaterThan(firstWord.startAt)
    expect(result.between(e => e.kind === 'stt.words' && e.committed, 'orchestration.send')).toBe(0)
  })

  it('is deterministic: one recording, one result', async () => {
    const run = async () => (await replay({
      components: [committer], adapters: ({ speech }) => [sttAdapter(speech)],
      messages: readProviderRecording(join(FIXTURES, 'assemblyai-pauses.jsonl')), tailMs: 0,
    })).events.map(e => [e.seq, e.kind, e.t])
    expect(await run()).toEqual(await run())
  })

  it('runs scripted faults at their moments', async () => {
    const result = await replay({
      components: [], audio: tone(1_000), adapters: ({ speech }) => [sttAdapter(speech)],
      at: [{ ms: 500, run: ({ speech }) => speech.drop('gone') }],
    })
    const status = result.first('stt.status')!
    expect(status.t).toBe(500)
  })
})

describe('the fake speech service', () => {
  const connected = async (rate?: number) => {
    const clock = fakeClock()
    const speech = fakeSpeechToText(clock)
    const got: string[] = []
    const closes: string[] = []
    const errors: string[] = []
    const conn = await speech.connect({
      onWords: (text) => got.push(`${text}@${clock.now()}`), onClose: r => closes.push(r), onError: m => errors.push(m),
    })
    if (rate !== undefined) speech.slow(rate)
    const feed = (ms: number) => { for (let i = 0; i < ms / FRAME_MS; i++) { conn.send(new Int16Array(FRAME_SAMPLES)); clock.advance(FRAME_MS) } }
    return { clock, speech, conn, got, closes, errors, feed }
  }

  it('keeps up by default: nothing waits', async () => {
    const { conn, feed } = await connected()
    feed(640)
    expect(conn.bufferedMs()).toBe(0)
  })

  it('slows down: a backlog grows at the rate the service falls behind', async () => {
    const { conn, feed, speech } = await connected(0.5)
    feed(1_280)
    expect(conn.bufferedMs()).toBeGreaterThan(540)
    expect(conn.bufferedMs()).toBeLessThan(740)
    expect(speech.takenMs()).toBeGreaterThan(540)
  })

  it('stalls: takes no audio and sends no words, until it resumes', async () => {
    const { conn, feed, speech, got } = await connected()
    speech.stall()
    feed(640)
    speech.say('hello', [], true)
    expect(conn.bufferedMs()).toBe(640)
    expect(speech.takenMs()).toBe(0)
    expect(got).toEqual([])
    speech.resume()
    expect(conn.bufferedMs()).toBe(0)
    expect(got).toEqual(['hello@640'])
  })

  it('takes audio in a burst after a stall', async () => {
    const { conn, feed, speech } = await connected()
    speech.stall()
    feed(960)
    expect(conn.bufferedMs()).toBe(960)
    speech.burst()
    expect(conn.bufferedMs()).toBe(0)
    expect(speech.takenMs()).toBe(960)
    feed(64)
    expect(conn.bufferedMs()).toBe(0)
  })

  it('delays words, and drops the connection', async () => {
    const { clock, speech, conn, got, closes, feed } = await connected()
    speech.delayWordsBy(300)
    speech.say('late', [], false)
    clock.advance(299)
    expect(got).toEqual([])
    clock.advance(1)
    expect(got).toEqual(['late@300'])
    speech.drop('network')
    expect(closes).toEqual(['network'])
    feed(64)
    expect(speech.lostSends()).toBe(2)
    speech.say('after', [], true)
    clock.advance(1_000)
    expect(got).toHaveLength(1)
    expect(conn.bufferedMs()).toBe(0)
  })

  it('reconnects, can fail to connect, reports errors and counts end-of-turn requests', async () => {
    const { speech, conn, errors } = await connected()
    conn.endTurn()
    speech.error('boom')
    speech.failNextConnect('refused')
    await expect(speech.connect({ onWords: () => undefined, onClose: () => undefined, onError: () => undefined })).rejects.toThrow('refused')
    await speech.connect({ onWords: () => undefined, onClose: () => undefined, onError: () => undefined })
    expect(speech.endTurns()).toBe(1)
    expect(errors).toEqual(['boom'])
    expect(speech.connections()).toBe(2)
  })

  it('stays bounded in a runtime: a stalled service does not stop events from being delivered', async () => {
    const result = await replay({
      components: [], audio: tone(2_000), adapters: ({ speech }) => [sttAdapter(speech)],
      at: [{ ms: 200, run: ({ speech }) => speech.stall() }, { ms: 1_800, run: ({ speech }) => speech.burst() }],
    })
    expect(result.of('audio.frame').length).toBe(Math.floor(tone(2_000).length / FRAME_SAMPLES))
    expect(result.env.speech.takenMs()).toBeGreaterThan(1_900)
  })
})

describe('the fake models', () => {
  it('return scripted voice scores in order, then the rest, and count resets', async () => {
    const vad = fakeVoiceActivityModel([0.9, 0.1], { rest: 0.5 })
    const frame = new Float32Array(FRAME_SAMPLES)
    expect([await vad.score(frame), await vad.score(frame), await vad.score(frame)]).toEqual([0.9, 0.1, 0.5])
    vad.reset()
    expect(vad.calls()).toBe(3)
    expect(vad.resets()).toBe(1)
    const byIndex = fakeVoiceActivityModel(i => (i % 2 ? 0 : 1))
    expect([await byIndex.score(frame), await byIndex.score(frame)]).toEqual([1, 0])
  })

  it('return scripted turn scores and note how much audio each was asked about', async () => {
    const turn = fakeTurnModel([0.2, 0.95])
    expect(await turn.score(new Float32Array(16_000))).toBe(0.2)
    expect(await turn.score(new Float32Array(32_000))).toBe(0.95)
    expect(turn.windows()).toEqual([16_000, 32_000])
  })

  it('answer after their latency on the fake clock', async () => {
    const clock = fakeClock()
    const turn = fakeTurnModel([0.7], { clock, latencyMs: 100 })
    let got: number | null = null
    void turn.score(new Float32Array(1)).then(v => { got = v })
    clock.advance(99)
    await Promise.resolve()
    expect(got).toBeNull()
    clock.advance(1)
    await Promise.resolve()
    expect(got).toBe(0.7)
  })
})
