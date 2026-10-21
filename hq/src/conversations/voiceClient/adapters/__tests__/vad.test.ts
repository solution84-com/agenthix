import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEventOf } from '../../events'
import { fakeVoiceActivityModel } from '../../models/fakes'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { VAD_MAX_PENDING, voiceActivity } from '../vad'

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

function setup(scores: Array<number | Error | null>) {
  const clock = fakeClock(100)
  const model = fakeVoiceActivityModel(scores)
  const adapter = voiceActivity(model)
  const runtime = createVoiceRuntime({ components: [], adapters: [adapter], settings: VOICE_SETTINGS, clock })
  const scored: VoiceEventOf<'acoustic.vadScore'>[] = []
  runtime.subscribe(['acoustic.vadScore'], e => scored.push(e as VoiceEventOf<'acoustic.vadScore'>))
  runtime.start()
  const frame = (value: number, t: number) => runtime.publish({ kind: 'audio.frame', pcm: new Int16Array(512).fill(value), t })
  return { model, adapter, runtime, scored, frame }
}

describe('silence detection’s model adapter', () => {
  it('scores each frame as floats, and publishes its confidence at the frame’s own time', async () => {
    const v = setup([0.2, 0.9])
    expect(v.model.resets).toBe(1)
    v.frame(16384, 1_000)
    v.frame(-32768, 1_032)
    await flush()
    expect(v.scored.map(e => [e.confidence, e.t])).toEqual([[0.2, 1_000], [0.9, 1_032]])
    expect(v.model.frames[0]![0]).toBe(0.5)
    expect(v.model.frames[1]![0]).toBe(-1)
  })

  it('skips frames while the model is too far behind, rather than queueing them without limit', async () => {
    const v = setup([null])
    for (let i = 0; i < VAD_MAX_PENDING + 5; i++) v.frame(0, i * 32)
    expect(v.model.frames).toHaveLength(VAD_MAX_PENDING)
    expect(v.adapter.skipped()).toBe(5)
  })

  it('publishes nothing for a frame the model failed on, nor after it is stopped', async () => {
    const v = setup([new Error('stopped'), 0.7])
    v.frame(0, 0)
    v.runtime.stop()
    v.frame(0, 32)
    await flush()
    expect(v.scored).toEqual([])
  })
})
