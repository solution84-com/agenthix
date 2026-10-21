/**
 * Silero VAD (acoustic spec, §2) behind `VoiceActivityModel`, done as its reference `OnnxWrapper` does at 16 kHz:
 * each 512-sample frame is scored with the 64 samples before it prepended, and the model's recurrent state carried
 * from one frame to the next. Reset clears both. Frames are scored strictly one after another, since each depends
 * on the state the previous one left.
 */
import type { InferenceSession, TensorConstructor } from 'onnxruntime-web'
import type { VoiceActivityModel } from '../ports'

export const VAD_FRAME = 512
const CONTEXT = 64
const STATE_SIZE = 2 * 1 * 128

export function createSileroVad(session: InferenceSession, Tensor: TensorConstructor): VoiceActivityModel {
  let state = new Float32Array(STATE_SIZE)
  let context = new Float32Array(CONTEXT)
  let queue: Promise<unknown> = Promise.resolve()
  const sampleRate = new Tensor('int64', BigInt64Array.from([16000n]), [])

  const run = async (frame: Float32Array): Promise<number> => {
    if (frame.length !== VAD_FRAME) throw new Error(`Silero VAD scores ${VAD_FRAME}-sample frames, not ${frame.length}`)
    const input = new Float32Array(CONTEXT + VAD_FRAME)
    input.set(context)
    input.set(frame, CONTEXT)
    const out = await session.run({
      input: new Tensor('float32', input, [1, CONTEXT + VAD_FRAME]),
      state: new Tensor('float32', state, [2, 1, 128]),
      sr: sampleRate,
    })
    state = Float32Array.from(out.stateN!.data as Float32Array)
    context = input.slice(-CONTEXT)
    return (out.output!.data as Float32Array)[0]!
  }

  return {
    score(frame) {
      const job = queue.then(() => run(frame))
      queue = job.catch(() => undefined)
      return job
    },
    reset() {
      queue = queue.then(() => {
        state = new Float32Array(STATE_SIZE)
        context = new Float32Array(CONTEXT)
      })
    },
  }
}
