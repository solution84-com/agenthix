import type { Clock } from '../../clock'
import type { TurnModel, VoiceActivityModel } from '../../ports'

type Scores = readonly number[] | ((index: number) => number)

type ScriptOptions = {
  /** What a call past the end of a list returns. */
  rest?: number
  /** With a clock, a score arrives this long after the call, as a model on a worker would. */
  latencyMs?: number
  clock?: Clock
}

function scripted(scores: Scores, options: ScriptOptions) {
  let calls = 0
  const next = (): Promise<number> => {
    const index = calls++
    const value = typeof scores === 'function' ? scores(index) : (scores[index] ?? options.rest ?? 0)
    if (options.latencyMs && options.clock) return new Promise(resolve => options.clock!.after(options.latencyMs!, () => resolve(value)))
    return Promise.resolve(value)
  }
  return { next, calls: () => calls }
}

export type FakeVoiceActivityModel = VoiceActivityModel & { calls: () => number; resets: () => number }

/** Returns the scores in order, one per frame; `rest` (default 0) once they run out. */
export function fakeVoiceActivityModel(scores: Scores, options: ScriptOptions = {}): FakeVoiceActivityModel {
  const script = scripted(scores, options)
  let resets = 0
  return { score: () => script.next(), reset: () => { resets++ }, calls: script.calls, resets: () => resets }
}

export type FakeTurnModel = TurnModel & { calls: () => number; windows: () => readonly number[] }

/** Returns the scores in order, one per question; `windows` is the length in samples of the audio each was asked about. */
export function fakeTurnModel(scores: Scores, options: ScriptOptions = {}): FakeTurnModel {
  const script = scripted(scores, options)
  const windows: number[] = []
  return { score: (audio) => { windows.push(audio.length); return script.next() }, calls: script.calls, windows: () => windows }
}
