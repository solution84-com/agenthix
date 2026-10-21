import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import { TURN_WINDOW } from '../../models/smartTurn'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { fakeTurnModel } from '../../models/fakes'
import { turnAdapter } from '../turnAdapter'

function setup(model: ReturnType<typeof fakeTurnModel>) {
  const clock = fakeClock()
  const runtime = createVoiceRuntime({ components: [], adapters: [turnAdapter({ model: () => model })], settings: VOICE_SETTINGS, clock })
  const scores: Array<[number, number]> = []
  const failures: string[] = []
  runtime.subscribe(['semantics.score'], e => scores.push([e.score, e.silenceMs]))
  runtime.subscribe(['semantics.failed'], e => failures.push(e.reason))
  runtime.start()
  const frame = (value: number, samples = 512) =>
    runtime.publish({ kind: 'audio.frame', pcm: new Int16Array(samples).fill(value), t: clock.now() })
  const ask = () => runtime.publish({ kind: 'semantics.ask', silenceMs: 200, t: clock.now() })
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
  return { runtime, scores, failures, frame, ask, flush, clock }
}

describe('the turn adapter @SC-995', () => {
  it('scores the audio it holds, as floats, and publishes the score', async () => {
    const model = fakeTurnModel([0.7])
    const c = setup(model)
    c.frame(16384, 4); c.frame(-16384, 4)
    c.ask()
    await c.flush()
    expect(Array.from(model.asked[0]!)).toEqual([0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5])
    expect(c.scores).toEqual([[0.7, 200]])
  })

  it('keeps only the last 8 s', async () => {
    const model = fakeTurnModel([0.5])
    const c = setup(model)
    for (let i = 0; i < 6; i++) c.frame(1000 + i, TURN_WINDOW / 4)
    c.ask()
    await c.flush()
    const asked = model.asked[0]!
    expect(asked.length).toBe(TURN_WINDOW)
    expect(asked[0]).toBeCloseTo(1002 / 32768)
    expect(asked[asked.length - 1]).toBeCloseTo(1005 / 32768)
  })

  it('publishes a failure when the model fails', async () => {
    const c = setup(fakeTurnModel([new Error('boom')]))
    c.frame(1)
    c.ask()
    await c.flush()
    expect(c.failures).toEqual(['boom'])
    expect(c.scores).toEqual([])
  })

  it('drops an answer to a pause the person has since spoken through', async () => {
    const c = setup(fakeTurnModel([0.9]))
    c.frame(1)
    c.ask()
    c.runtime.publish({ kind: 'acoustic.silence', silent: false, t: c.clock.now() })
    await c.flush()
    expect(c.scores).toEqual([])
  })

  it('has a queue of one: a newer ask replaces the one waiting behind a score in flight', async () => {
    const model = fakeTurnModel([0.1, 0.2, 0.3])
    const c = setup(model)
    c.frame(1)
    c.ask(); c.frame(2); c.ask(); c.frame(3); c.ask()
    await c.flush()
    expect(c.scores.map(s => s[0])).toEqual([0.1, 0.2])
    expect(model.asked).toHaveLength(2)
    expect([model.asked[0]!.length, model.asked[1]!.length]).toEqual([512, 1536])
  })
})
