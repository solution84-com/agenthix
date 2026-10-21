import { beforeAll, describe, expect, it } from 'vitest'
import type { TurnModel } from '../../ports'
import { TURN_WINDOW, turnWindow } from '../smartTurn'
import { medianMs, said, speechAvailable, twoTones } from './clips'
import { smartTurn } from './onDisk'

// Smart Turn v3.2's reference `predict_endpoint` (CPU model, onnxruntime 1.31, Python) on the same two tones.
const REFERENCE_TWO_TONES = 0.08002513647079468
// Measured at about 205 ms, of which the features are about 25 ms (Node 24, ONNX Runtime Web's WebAssembly build,
// one thread, an Apple M-series laptop), and at about 660 ms on a shared CI runner. The budget leaves room for a
// slower machine, so it catches a model or runtime several times slower, not a slow runner; the spec's 200 ms
// fallback is Semantics' to apply.
const SCORE_BUDGET_MS = 1500

describe("Smart Turn's window", () => {
  it('pads a short clip with zeros at the start, so the audio ends the window', () => {
    const window = turnWindow(Float32Array.from([1, 2, 3]))
    expect(window).toHaveLength(TURN_WINDOW)
    expect(Array.from(window.subarray(-3))).toEqual([1, 2, 3])
    expect(window.subarray(0, -3).every((x) => x === 0)).toBe(true)
  })

  it('keeps the last 8 s of a long clip', () => {
    const long = Float32Array.from({ length: TURN_WINDOW + 10 }, (_, i) => i)
    const window = turnWindow(long)
    expect(window).toHaveLength(TURN_WINDOW)
    expect(window[0]).toBe(10)
    expect(window[TURN_WINDOW - 1]).toBe(TURN_WINDOW + 9)
  })
})

describe('Smart Turn, the real model', () => {
  let turn: TurnModel
  beforeAll(async () => { turn = await smartTurn() })

  it('scores the same audio as the upstream reference does', async () => {
    expect(await turn.score(twoTones())).toBeCloseTo(REFERENCE_TWO_TONES, 4)
  })

  it.runIf(speechAvailable)('scores a finished question higher than "I think we should" (needs macOS `say`)', async () => {
    const finished = await turn.score(said("What's the status of the deploy?"))
    const unfinished = await turn.score(said('I think we should'))
    expect(finished).toBeGreaterThan(unfinished)
    expect(finished).toBeGreaterThan(0.5)
    expect(unfinished).toBeLessThan(0.3)
  })

  it(`scores 8 s of audio within ${SCORE_BUDGET_MS} ms`, async () => {
    const audio = twoTones(8)
    expect(await medianMs(() => turn.score(audio), 3)).toBeLessThan(SCORE_BUDGET_MS)
  })
})
