/**
 * The real models for contract tests, loaded in Node from the files hq serves, through the same ONNX Runtime Web
 * the browser's worker uses (its WebAssembly build).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ort from 'onnxruntime-web'
import type { VoiceActivityModel } from '../../ports'
import { SILERO_VAD_FILE, SMART_TURN_FILE, type ModelFile } from '../modelFiles'
import { createSileroVad, VAD_FRAME } from '../sileroVad'
import { createSmartTurn } from '../smartTurn'

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../public')

export const servedFile = (file: ModelFile) => new Uint8Array(readFileSync(path.join(PUBLIC, file.path)))
export const servedText = (name: string) => readFileSync(path.join(PUBLIC, name), 'utf8')

ort.env.wasm.numThreads = 1

export const sileroVad = async () =>
  createSileroVad(await ort.InferenceSession.create(servedFile(SILERO_VAD_FILE)), ort.Tensor)

export const smartTurn = async () =>
  createSmartTurn(await ort.InferenceSession.create(servedFile(SMART_TURN_FILE)), ort.Tensor)

/** Scores every whole frame of `audio`, from a fresh stream. */
export async function vadScores(vad: VoiceActivityModel, audio: Float32Array): Promise<number[]> {
  vad.reset()
  const scores: number[] = []
  for (let i = 0; i + VAD_FRAME <= audio.length; i += VAD_FRAME) scores.push(await vad.score(audio.subarray(i, i + VAD_FRAME)))
  return scores
}
