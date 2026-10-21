import { describe, expect, it } from 'vitest'
import { fakeTurnModel } from '../../__tests__/harness/fakeModels'
import { FRAME_SAMPLES, replay, type ReplayEnv } from '../../__tests__/harness/replay'
import { tone } from '../../__tests__/harness/wav'
import { floor } from '../../orchestration/floor'
import { scheduler } from '../../orchestration/scheduler'
import { utterance } from '../../stt/utterance'
import { VOICE_SETTINGS } from '../../settings'
import { semanticsParts } from '../index'

type Step = { ms: number; voice?: boolean; person?: { text: string; committed: boolean; order: number } }

/** The person's speech and pauses scripted as acoustic events and words, over audio of the same shape. */
function run(steps: Step[], audioMs: number, scores: Parameters<typeof fakeTurnModel>[0], options: { latencyMs?: number } = {}) {
  let model: ReturnType<typeof fakeTurnModel> | null = null
  const parts = (env: Pick<ReplayEnv, 'clock'>) => {
    model = fakeTurnModel(scores, { ...options, clock: env.clock })
    return semanticsParts({ model }).adapters
  }
  const audio = tone(audioMs)
  return replay({
    // The words become what the person is saying (utterance), which the scheduler sends on READY.
    components: [floor, scheduler, utterance, ...semanticsParts().components],
    adapters: parts,
    // STT is not in this replay: the words are scripted, and always in time.
    settings: { ...VOICE_SETTINGS, inbound: { ...VOICE_SETTINGS.inbound, readyHeardMs: Infinity } },
    audio,
    tailMs: 4_000,
    at: steps.map(step => ({
      ms: step.ms,
      run: ({ runtime, clock }) => {
        if (step.voice !== undefined) runtime.publish({ kind: 'acoustic.silence', silent: !step.voice, t: clock.now() })
        if (step.person) runtime.publish({ kind: 'stt.person', ...step.person, timed: [], t: clock.now() })
      },
    })),
  }).then(result => ({ result, model: () => model! }))
}

const sends = (r: Awaited<ReturnType<typeof run>>['result']) => r.of('orchestration.send')

describe('the owner’s scenarios, replayed @SC-995', () => {
  it('scenario 1: a clear question is READY at the 0.5 s mark and sent then', async () => {
    const { result, model } = await run([
      { ms: 0, voice: true },
      { ms: 1_000, person: { text: 'What is the status of the deploy?', committed: true, order: 0 } },
      { ms: 1_500, voice: false },
    ], 5_000, [0.95], { latencyMs: 205 })
    expect(result.of('semantics.decision')).toMatchObject([{ answer: 'READY', silenceMs: 500, by: 'model', confidence: 0.95 }])
    expect(sends(result).map(s => s.text)).toEqual(['What is the status of the deploy?'])
    expect(sends(result)[0]!.t).toBeGreaterThanOrEqual(2_000)
    expect(sends(result)[0]!.t).toBeLessThan(2_100)
    expect(model().calls()).toBe(1)
    // The speech and 200 ms of silence: the audio up to the moment it was asked.
    expect(Math.abs(model().windows()[0]! - 1_700 * 16)).toBeLessThanOrEqual(FRAME_SAMPLES * 2)
  })

  it('scenario 2: hesitations keep the floor, and the whole sentence is sent once, after the last pause', async () => {
    const { result, model } = await run([
      { ms: 0, voice: true },
      { ms: 900, person: { text: 'I think we should', committed: true, order: 0 } },
      { ms: 1_000, voice: false },
      { ms: 1_800, voice: true },
      { ms: 2_700, person: { text: 'move the meeting to Tuesday.', committed: true, order: 1 } },
      { ms: 2_800, voice: false },
    ], 8_000, [0.05, 0.95], { latencyMs: 205 })
    const decisions = result.of('semantics.decision')
    expect(decisions.filter(d => d.t < 1_800).map(d => d.answer)).toEqual(['UNCERTAIN'])
    expect(sends(result).map(s => s.text)).toEqual(['I think we should move the meeting to Tuesday.'])
    expect(sends(result)[0]!.t).toBeGreaterThanOrEqual(3_300)
    expect(model().calls()).toBe(2)
  })

  it('the fallback: a model that never answers cannot end the turn before 3 s of silence', async () => {
    const { result } = await run([
      { ms: 0, voice: true },
      { ms: 1_000, person: { text: 'Let us move the meeting to Tuesday', committed: true, order: 0 } },
      { ms: 1_500, voice: false },
    ], 8_000, [0.95], { latencyMs: 60_000 })
    const decisions = result.of('semantics.decision')
    expect(decisions.map(d => [d.answer, d.by])).toEqual([['UNCERTAIN', 'fallback'], ['READY', 'fallback']])
    expect(decisions[1]!.t).toBeGreaterThanOrEqual(4_500)
    expect(decisions[1]!.t).toBeLessThan(4_600)
    expect(sends(result).map(s => s.text)).toEqual(['Let us move the meeting to Tuesday'])
  })
})
