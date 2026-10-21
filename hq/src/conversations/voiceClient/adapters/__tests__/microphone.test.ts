import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEventOf } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { audioFrames, FRAME_SAMPLES } from '../microphone'

describe('the microphone’s frames', () => {
  it('publishes 512 samples (32 ms at 16 kHz) a frame, in order, whatever size the audio comes in', () => {
    const clock = fakeClock(1_000)
    const runtime = createVoiceRuntime({ components: [], adapters: [], settings: VOICE_SETTINGS, clock })
    const frames: VoiceEventOf<'audio.frame'>[] = []
    runtime.subscribe(['audio.frame'], e => frames.push(e as VoiceEventOf<'audio.frame'>))
    const push = audioFrames(runtime)
    let n = 0
    const chunk = (size: number) => Int16Array.from({ length: size }, () => n++)
    push(chunk(1600))
    expect(frames).toHaveLength(3)
    push(chunk(1600))
    expect(frames).toHaveLength(6)
    push(chunk(256))
    expect(frames).toHaveLength(6)
    push(chunk(128))
    expect(frames).toHaveLength(7)
    expect(FRAME_SAMPLES).toBe(512)
    expect(frames.every(f => f.pcm.length === 512)).toBe(true)
    expect(frames.flatMap(f => [...f.pcm])).toEqual(Array.from({ length: 7 * 512 }, (_, i) => i))
    expect(frames[0]!.t).toBe(1_000)
  })
})
