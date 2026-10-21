/**
 * Fakes of the two models for tests: each answers from a scripted list, one entry per call. An entry is a score, an
 * `Error` (the call fails) or `null` (the call never answers, as a model that has stalled). Past the end of the
 * list, the last entry repeats. Every input is kept, so a test can check what the model was asked.
 */
import type { TurnModel, VoiceActivityModel } from '../ports'

export type Scripted = number | Error | null

function scripted(entries: readonly Scripted[]) {
  if (entries.length === 0) throw new Error('A scripted model needs at least one entry')
  let at = 0
  return (): Promise<number> => {
    const entry = entries[Math.min(at++, entries.length - 1)]!
    if (entry === null) return new Promise<number>(() => {})
    return entry instanceof Error ? Promise.reject(entry) : Promise.resolve(entry)
  }
}

export type FakeVoiceActivityModel = VoiceActivityModel & { frames: Float32Array[]; resets: number }

export function fakeVoiceActivityModel(scores: readonly Scripted[]): FakeVoiceActivityModel {
  const next = scripted(scores)
  const fake: FakeVoiceActivityModel = {
    frames: [],
    resets: 0,
    score(frame) {
      fake.frames.push(frame.slice())
      return next()
    },
    reset() { fake.resets++ },
  }
  return fake
}

export type FakeTurnModel = TurnModel & { asked: Float32Array[] }

export function fakeTurnModel(scores: readonly Scripted[]): FakeTurnModel {
  const next = scripted(scores)
  const fake: FakeTurnModel = {
    asked: [],
    score(audio) {
      fake.asked.push(audio.slice())
      return next()
    },
  }
  return fake
}
