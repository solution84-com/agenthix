import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sttInbound } from '../../adapters/sttInbound'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { readProviderRecording } from '../../__tests__/harness/recording'
import { FRAME_MS, replay, type ReplayEnv, type ReplayOptions } from '../../__tests__/harness/replay'
import { framesToAudio, silenceDetector, transcribing, wordText } from './transcribing'

/**
 * `assemblyai-long-session.jsonl`: a minute of conversation streamed in real time on one connection, on which the
 * service fell further and further behind (its words for the first message came about 0.3 s after they were
 * spoken, for the last about 25 s). Replayed here as the service behaved: the person's words at their recorded
 * times, and each word heard back as late as the recording heard a word that far into one connection's stream.
 */
const FIXTURE = join(__dirname, '..', '..', '__tests__', 'fixtures', 'assemblyai-long-session.jsonl')
const messages = readProviderRecording(FIXTURE)
const turns = messages.filter(m => m.msg.type === 'Turn' && m.msg.end_of_turn && m.msg.words?.length)
/** The person's lines, each running on to the end of a word the service timed just after it. */
const timeline = (JSON.parse(readFileSync(FIXTURE, 'utf8').split('\n')[0]!) as { timeline: Array<{ who: string; from: number; to: number }> })
  .timeline.filter(s => s.who === 'person')
  .map(s => ({ ...s, to: Math.max(s.to, ...turns.flatMap(m => m.msg.words!).filter(w => w.start >= s.from && w.start < s.to + 600).map(w => w.end)) }))
/** The recorded words in order, each starting at least two frames after the one before (some are timed alike). */
const recorded = turns.flatMap((m, turn) => m.msg.words!.map(w => ({ turn, start: w.start, end: w.end })))
  .reduce<Array<{ turn: number; start: number; end: number }>>((out, w) => {
    const start = Math.max(w.start, (out.at(-1)?.start ?? -Infinity) + 2 * FRAME_MS)
    return [...out, { ...w, start, end: Math.max(w.end, start + 2 * FRAME_MS) }]
  }, [])

/**
 * The session's audio, frame by frame: the person's voice through each of their lines in the timeline, each frame
 * the word spoken then (the last to have begun); outside them, the words the service heard of the agent's voice.
 */
const codes: number[] = (() => {
  const out: number[] = []
  // The microphone goes on after the last word: the replay's tail is silence, not the end of the audio.
  const end = Math.max(...recorded.map(w => w.end), ...timeline.map(s => s.to)) + 8_000
  for (let at = 0; at < end; at += FRAME_MS) {
    const mid = at + FRAME_MS / 2
    const line = timeline.find(s => mid >= s.from && mid < s.to)
    let index = -1
    if (line) {
      const inLine = recorded.flatMap((w, i) => (w.start >= line.from - 300 && w.start < line.to ? [i] : []))
      index = inLine.filter(i => recorded[i]!.start <= mid).at(-1) ?? inLine[0] ?? -1
    } else index = recorded.findIndex(w => mid >= w.start && mid < w.end)
    out.push(index < 0 ? 0 : 1000 + index)
  }
  return out
})()

/** When each word was spoken, as the audio holds it. */
const spoken = recorded.map((w, i) => {
  const frames = codes.flatMap((c, f) => (c === 1000 + i ? [f] : []))
  return { turn: w.turn, startAt: frames[0]! * FRAME_MS, endAt: (frames.at(-1)! + 1) * FRAME_MS }
})

const audioOfTheSession = () => framesToAudio(codes)

/** How late the recording heard a word, by how far into the connection's stream it ended. */
const recordedLag = messages
  .filter(m => m.msg.type === 'Turn' && !m.msg.end_of_turn && m.msg.words?.length)
  .map(m => { const end = Math.max(...m.msg.words!.map(w => w.end)); return { end, lag: m.at - end } })
  .sort((a, b) => a.end - b.end)

function lagAt(streamMs: number): number {
  const after = recordedLag.findIndex(p => p.end >= streamMs)
  if (after <= 0) return recordedLag[after === 0 ? 0 : recordedLag.length - 1]!.lag
  const a = recordedLag[after - 1]!
  const b = recordedLag[after]!
  return a.lag + ((b.lag - a.lag) * (streamMs - a.end)) / Math.max(1, b.end - a.end)
}

/** Each of the person's lines sent as a message a second after it ends, as the turn decision would. */
const sends = timeline.map(line => ({
  ms: line.to + 1_000,
  run: ({ runtime, clock }: ReplayEnv) => runtime.publish({ kind: 'orchestration.send', text: '', append: false, t: clock.now() }),
}))

async function session(settings: VoiceSettings = VOICE_SETTINGS, at: ReplayOptions['at'] = []) {
  const result = await replay({
    components: [silenceDetector()],
    adapters: ({ clock, speech }) => [sttInbound({
      clock, getToken: async () => 'token', service: () => transcribing(clock, speech, { lagAt }),
    })],
    audio: audioOfTheSession(), settings, tailMs: 1_000, at,
  })
  const words = result.of('stt.words')
  /** Each turn's words: how long after it was spoken each was first shown, at the median. */
  const lagByTurn = turns.map((_, turn) => {
    const lags = spoken.flatMap((s, i) => {
      if (s.turn !== turn) return []
      const shown = words.find(e => e.words.some(w => w.text === wordText(i)))
      return [shown ? shown.t - s.endAt : Infinity]
    }).sort((a, b) => a - b)
    return lags[Math.floor(lags.length / 2)]!
  })
  const committed = words.filter(e => e.committed).flatMap(e => e.words.map(w => w.text))
  return { result, lagByTurn, committed }
}

describe('recorded: a minute of conversation, replayed through the inbound loop', () => {
  it('every word of the recording is a word of its own here', () => {
    expect(spoken.length).toBeGreaterThan(40)
    expect(new Set(audioOfTheSession().filter((_, i) => i % 512 === 0)).size).toBe(spoken.length + 1)
  })

  it('kept on one connection, as the recording was, the lag grows as it did', async () => {
    const { lagByTurn } = await session({ ...VOICE_SETTINGS, inbound: { ...VOICE_SETTINGS.inbound, queueLimitMs: 1e9, replaceAboveLagMs: 1e9, idleAfterSilenceMs: 1e9 } })
    expect(lagByTurn[0]!).toBeLessThan(1_000)
    expect(lagByTurn.at(-1)!).toBeGreaterThan(15_000)
  })

  it('with each message sent too, on the connection kept: the words show within about 2 s all through, none lost', async () => {
    const { lagByTurn, committed } = await session(VOICE_SETTINGS, sends)
    for (const lag of lagByTurn) expect(lag).toBeLessThan(2_500)
    expect(lagByTurn.slice(1).every(lag => lag < lagByTurn[1]! + 500)).toBe(true)
    expect(committed).toEqual(spoken.map((_, i) => wordText(i)))
  })

  it('the lag stays bounded and does not grow, and no word is lost: the connection is closed through the agent’s turns, and each of the person’s starts on a fresh one', async () => {
    const { result, lagByTurn, committed } = await session()
    expect(result.of('stt.status').filter(e => e.state === 'idle').length).toBeGreaterThan(0)
    for (const lag of lagByTurn) expect(lag).toBeLessThan(3_000)
    expect(lagByTurn.at(-1)!).toBeLessThan(2_000)
    expect(committed).toEqual(spoken.map((_, i) => wordText(i)))
  })
})
