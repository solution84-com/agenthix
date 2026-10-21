import { beforeAll, describe, expect, it } from 'vitest'
import type { VoiceActivityModel } from '../../ports'
import { VAD_FRAME } from '../sileroVad'
import { medianMs, said, silence, speechAvailable, twoTones } from './clips'
import { sileroVad, vadScores } from './onDisk'

// The reference `OnnxWrapper` of silero-vad v6.2.3 (onnxruntime 1.31, Python) on the same two tones, frame by frame.
const REFERENCE_FIRST_FRAMES = [
  0.07696568965911865, 0.09388771653175354, 0.049397557973861694, 0.025404751300811768, 0.016754329204559326,
  0.010748893022537231, 0.008190631866455078, 0.008035749197006226, 0.008565127849578857, 0.00733521580696106,
  0.007203102111816406, 0.0063974857330322266, 0.005034714937210083, 0.004827409982681274, 0.0045119524002075195,
  0.004123181104660034, 0.00428202748298645, 0.0038847029209136963, 0.004211992025375366, 0.0037817656993865967,
]
// Measured at 0.2 ms a frame (Node 24, ONNX Runtime Web's WebAssembly build, one thread, an Apple M-series laptop);
// a frame is 32 ms of audio, and the budget leaves room for a slower machine.
const FRAME_BUDGET_MS = 5

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!

describe('Silero VAD, the real model', () => {
  let vad: VoiceActivityModel
  beforeAll(async () => { vad = await sileroVad() })

  it("scores each frame as the upstream reference does, carrying its state and context from frame to frame", async () => {
    const scores = await vadScores(vad, twoTones())
    REFERENCE_FIRST_FRAMES.forEach((expected, i) => expect(scores[i]).toBeCloseTo(expected, 4))
  })

  it('starts a new stream on reset', async () => {
    const first = await vadScores(vad, twoTones(0.5))
    const again = await vadScores(vad, twoTones(0.5))
    expect(again).toEqual(first)
  })

  it('scores silence below 0.1', async () => {
    expect(Math.max(...(await vadScores(vad, silence())))).toBeLessThan(0.1)
  })

  it('scores a steady tone below 0.1', async () => {
    expect(Math.max(...(await vadScores(vad, twoTones())))).toBeLessThan(0.1)
  })

  it.runIf(speechAvailable)('scores speech above 0.8 (needs macOS `say`)', async () => {
    expect(median(await vadScores(vad, said('The quick brown fox jumps over the lazy dog.')))).toBeGreaterThan(0.8)
  })

  it('refuses a frame that is not 512 samples, and goes on scoring after it', async () => {
    vad.reset()
    await expect(vad.score(new Float32Array(480))).rejects.toThrow(/512/)
    expect(await vad.score(new Float32Array(VAD_FRAME))).toBeLessThan(0.1)
  })

  it(`scores a frame within ${FRAME_BUDGET_MS} ms`, async () => {
    const frame = twoTones().subarray(0, VAD_FRAME)
    const ms = await medianMs(async () => { for (let i = 0; i < 50; i++) await vad.score(frame) })
    expect(ms / 50).toBeLessThan(FRAME_BUDGET_MS)
  })
})
