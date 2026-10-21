import { describe, expect, it } from 'vitest'
import { turnWindow } from '../smartTurn'
import { MEL_BANDS, melFilterBank, whisperLogMel } from '../whisperFeatures'
import { twoTones } from './clips'

// Taken from the upstream reference, `WhisperFeatureExtractor(chunk_length=8)` in transformers 5.20 (its NumPy
// path), on the same two tones padded to 8 s as Smart Turn's `predict_endpoint` pads them.
const REFERENCE = {
  filterSum: 1.999024102917858,
  mean: -0.1302463561296463,
  min: -0.2223682403564453,
  max: 1.7776317596435547,
  at: [[0, 0, -0.2223682403564453], [10, 700, 0.5841375589370728], [40, 750, -0.19296741485595703],
    [79, 799, -0.14523613452911377], [5, 790, 1.7776246070861816]],
}

describe("Whisper's features", () => {
  it('builds the 80 Slaney mel filters over 201 bins as the reference does', () => {
    const bank = melFilterBank()
    expect(bank).toHaveLength(MEL_BANDS)
    expect(bank.every((band) => band.length === 201)).toBe(true)
    expect(bank.reduce((sum, band) => sum + band.reduce((s, w) => s + w, 0), 0)).toBeCloseTo(REFERENCE.filterSum, 9)
  })

  it("gives the reference extractor's values for the same 8 s of audio", () => {
    const { data, frames } = whisperLogMel(turnWindow(twoTones()))
    expect(frames).toBe(800)
    expect(data).toHaveLength(MEL_BANDS * 800)
    expect(data.reduce((s, v) => s + v, 0) / data.length).toBeCloseTo(REFERENCE.mean, 5)
    expect(Math.min(...data)).toBeCloseTo(REFERENCE.min, 5)
    expect(Math.max(...data)).toBeCloseTo(REFERENCE.max, 5)
    for (const [band, frame, value] of REFERENCE.at) expect(data[band! * frames + frame!]).toBeCloseTo(value!, 4)
  })

  it('gives finite values for pure silence', () => {
    const { data } = whisperLogMel(new Float32Array(8 * 16000))
    expect(data.every(Number.isFinite)).toBe(true)
  })
})
