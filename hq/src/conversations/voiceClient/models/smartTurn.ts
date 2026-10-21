/**
 * Smart Turn (semantics spec, §2) behind `TurnModel`, done as its reference `predict_endpoint` does: the last 8 s
 * of audio, zeros in front when shorter, Whisper's features of that, and the model's output, already a probability.
 */
import type { InferenceSession, TensorConstructor } from 'onnxruntime-web'
import type { TurnModel } from '../ports'
import { MEL_BANDS, whisperLogMel } from './whisperFeatures'

export const TURN_WINDOW = 8 * 16000

/** The window the model reads: the end of `audio`, padded at the start to exactly 8 s. */
export function turnWindow(audio: Float32Array): Float32Array {
  if (audio.length >= TURN_WINDOW) return audio.slice(audio.length - TURN_WINDOW)
  const window = new Float32Array(TURN_WINDOW)
  window.set(audio, TURN_WINDOW - audio.length)
  return window
}

export function createSmartTurn(session: InferenceSession, Tensor: TensorConstructor): TurnModel {
  return {
    async score(audio) {
      const { data, frames } = whisperLogMel(turnWindow(audio))
      const out = await session.run({ input_features: new Tensor('float32', data, [1, MEL_BANDS, frames]) })
      return (out[session.outputNames[0]!]!.data as Float32Array)[0]!
    },
  }
}
