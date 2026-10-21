import { describe, expect, it } from 'vitest'
import { sttInbound } from '../../adapters/sttInbound'
import type { VoiceEventOf } from '../../events'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { replay, type ReplayEnv, type ReplayResult } from '../../__tests__/harness/replay'
import { script, silenceDetector, transcribing, type TranscribingOptions } from './transcribing'

type Spoken = ReturnType<typeof script>['spoken']

/** Ten messages of six words, a second and a half each, with a second and a half between them. */
const TEN_MESSAGES = Array.from({ length: 10 }, () => [6, 1_500] as [number, number])

async function talk(opts: {
  at?: Array<{ ms: number; run: (env: ReplayEnv) => void }>
  service?: TranscribingOptions
  settings?: VoiceSettings
  getToken?: () => Promise<string>
  failed?: (message: string) => void
} = {}) {
  const { audio, spoken } = script(TEN_MESSAGES)
  const result = await replay({
    components: [silenceDetector()],
    adapters: ({ clock, speech }) => [sttInbound({
      clock,
      getToken: opts.getToken ?? (async () => 'token'),
      service: () => transcribing(clock, speech, { faultsPerConnection: true, ...opts.service }),
      failed: opts.failed,
    })],
    audio, at: opts.at, settings: opts.settings, tailMs: 6_000,
  })
  return { result, spoken }
}

const committedWords = (r: ReplayResult) => r.of('stt.words').filter(e => e.committed).flatMap(e => e.words.map(w => w.text))

/** For each word spoken, how long after it was spoken it was first shown. */
function lags(r: ReplayResult, spoken: Spoken): number[] {
  const words = r.of('stt.words')
  return spoken.map((s) => {
    const shown = words.find(e => e.words.some(w => w.text === s.text))
    return shown ? shown.t - s.endAt : Infinity
  })
}

function expectNothingLost(r: ReplayResult, spoken: Spoken) {
  expect(committedWords(r)).toEqual(spoken.map(s => s.text))
}

/** A committed turn is never changed afterwards: nothing more is published under its order. */
function expectCommittedFinal(r: ReplayResult) {
  const committedAt = new Map<number, number>()
  for (const e of r.of('stt.words')) {
    expect(committedAt.has(e.order!)).toBe(false)
    if (e.committed) committedAt.set(e.order!, e.seq)
  }
}

const reasons = (r: ReplayResult) => r.of('stt.replace').map(e => e.reason)
const statuses = (r: ReplayResult) => r.of('stt.status').map((e: VoiceEventOf<'stt.status'>) => e.state)
const maxOf = (xs: number[]) => Math.max(...xs)

describe('the inbound loop, healthy', () => {
  it('shows each word soon after it is spoken, commits every word once, and keeps one connection', async () => {
    const { result, spoken } = await talk()
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
    expect(maxOf(lags(result, spoken))).toBeLessThan(700)
    expect(result.env.speech.connections()).toBe(1)
    expect(statuses(result)).toEqual(['connecting', 'open'])
    const published = result.of('stt.lag')
    expect(published.length).toBeGreaterThan(0)
    expect(maxOf(published.map(e => e.lagMs))).toBeLessThan(700)
  })

  it('sends audio at the pace of speech, never faster', async () => {
    const { result } = await talk()
    const received = result.env.speech.received()
    for (let i = 1; i < received.length; i++) expect(received[i]!.t - received[0]!.t).toBeGreaterThanOrEqual(i * 32 - 64)
  })
})

describe('the inbound loop under faults: the backlog stays bounded and no word is lost', () => {
  it('a slow service: the queue fills, and the connection is replaced', async () => {
    const { result, spoken } = await talk({ at: [{ ms: 3_000, run: ({ speech }) => speech.slow(0.25) }] })
    expect(reasons(result)).toContain('queue-full')
    expect(statuses(result)).toContain('reconnecting')
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
    expect(maxOf(lags(result, spoken))).toBeLessThan(4_000)
    expect(maxOf(lags(result, spoken).slice(-12))).toBeLessThan(700)
  })

  it('a stalled service: replaced once the queue holds its limit', async () => {
    const { result, spoken } = await talk({ at: [{ ms: 5_000, run: ({ speech }) => speech.stall() }] })
    const replaced = result.first(e => e.kind === 'stt.replace')!
    expect(replaced).toMatchObject({ reason: 'queue-full' })
    expect(replaced.t - 5_000).toBeGreaterThanOrEqual(VOICE_SETTINGS.inbound.queueLimitMs - 100)
    expect(replaced.t - 5_000).toBeLessThan(VOICE_SETTINGS.inbound.queueLimitMs + 200)
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
    expect(maxOf(lags(result, spoken))).toBeLessThan(4_000)
  })

  it('a burst after a short stall: everything held arrives, with no replacement', async () => {
    const { result, spoken } = await talk({
      at: [{ ms: 5_000, run: ({ speech }) => speech.stall() }, { ms: 5_600, run: ({ speech }) => speech.burst() }],
    })
    expect(reasons(result)).toEqual([])
    expectNothingLost(result, spoken)
    expect(maxOf(lags(result, spoken))).toBeLessThan(1_500)
  })

  it('a dropped connection mid-sentence: a fresh one carries the sentence on', async () => {
    const { result, spoken } = await talk({ at: [{ ms: 7_100, run: ({ speech }) => speech.drop('network') }] })
    expect(statuses(result)).toEqual(['connecting', 'open', 'reconnecting', 'open'])
    expect(result.env.speech.connections()).toBe(2)
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
    expect(maxOf(lags(result, spoken))).toBeLessThan(2_500)
  })

  it('a lagging service: replaced at the next pause once its lag passes the limit', async () => {
    const { result, spoken } = await talk({ at: [{ ms: 4_000, run: ({ speech }) => speech.delayWordsBy(4_600) }] })
    expect(reasons(result)).toContain('lagging')
    const replaced = result.first(e => e.kind === 'stt.replace')!
    const silence = result.of('acoustic.silence').filter(e => e.silent && e.t <= replaced.t).at(-1)!
    expect(replaced.t - silence.t).toBeLessThan(3_000)
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
    expect(maxOf(lags(result, spoken).slice(-18))).toBeLessThan(700)
  })

  it('a stall of a few seconds: the connection is kept, and nothing is lost', async () => {
    const { result, spoken } = await talk({ at: [{ ms: 4_000, run: ({ speech }) => speech.delayWordsBy(2_600) }] })
    expect(reasons(result)).toEqual([])
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
  })

  it('a service that cannot be reached: tried again, then reported failed', async () => {
    const failed: string[] = []
    const { result } = await talk({ getToken: () => Promise.reject(new Error('no token')), failed: m => failed.push(m) })
    expect(statuses(result)).toEqual(['connecting', 'reconnecting', 'failed'])
    expect(failed).toEqual(['Speech to text stopped: no token.'])
  })
})

describe('a message sent', () => {
  it('keeps the connection, committing what was heard, and loses nothing after it', async () => {
    const { result, spoken } = await talk({
      at: [{ ms: 2_600, run: ({ runtime, clock }) => runtime.publish({ kind: 'orchestration.send', text: 'w0 w1 w2 w3 w4 w5', append: false, t: clock.now() }) }],
    })
    expect(reasons(result)).toEqual([])
    expect(statuses(result)).toEqual(['connecting', 'open'])
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
  })

  it('hears nothing while muted', async () => {
    const { result } = await talk({
      at: [{ ms: 0, run: ({ runtime }) => runtime.publish({ kind: 'stt.muted', muted: true, t: 0 }) }],
    })
    expect(result.of('stt.words')).toEqual([])
    expect(result.env.speech.received()).toEqual([])
  })
})

describe('a long silence: never a gap mid-connection', () => {
  it('closes the connection once it has heard what came before, and opens a fresh one at the next speech, losing nothing', async () => {
    const { audio, spoken } = script([[6, 4_500], [6, 4_500]])
    const result = await replay({
      components: [silenceDetector()],
      adapters: ({ clock, speech }) => [sttInbound({
        clock, getToken: async () => 'token', service: () => transcribing(clock, speech, { faultsPerConnection: true }),
      })],
      audio, tailMs: 1_000,
    })
    expect(statuses(result)).toEqual(['connecting', 'open', 'idle', 'connecting', 'open', 'idle'])
    expect(result.env.speech.connections()).toBe(2)
    expectNothingLost(result, spoken)
    expectCommittedFinal(result)
    // Audio went out with no gap while each connection was open: from its first chunk to its last, as spoken.
    const received = result.env.speech.received()
    const gaps = received.slice(1).map((r, i) => r.t - received[i]!.t)
    expect(gaps.filter(g => g > 200)).toHaveLength(1)
    expect(maxOf(lags(result, spoken))).toBeLessThan(1_200)
  })

  it('keeps the first words when silence detection is slow to say voice', async () => {
    const { audio, spoken } = script([[6, 1_500], [6, 1_500]], 8, 5_000)
    const result = await replay({
      // Voice is confirmed only after 20 frames (640 ms), as when a first short word dips below the threshold.
      components: [silenceDetector(20)],
      adapters: ({ clock, speech }) => [sttInbound({
        clock, getToken: async () => 'token', service: () => transcribing(clock, speech, { faultsPerConnection: true }),
      })],
      audio, tailMs: 1_000,
    })
    expectNothingLost(result, spoken)
  })

  it('sends nothing before the person first speaks beyond the moment before it', async () => {
    const { audio, spoken } = script([[6, 1_500]], 8, 5_000)
    const result = await replay({
      components: [silenceDetector()],
      adapters: ({ clock, speech }) => [sttInbound({
        clock, getToken: async () => 'token', service: () => transcribing(clock, speech, { faultsPerConnection: true }),
      })],
      audio, tailMs: 1_000,
    })
    expect(statuses(result).slice(0, 4)).toEqual(['connecting', 'open', 'idle', 'connecting'])
    expectNothingLost(result, spoken)
  })
})

