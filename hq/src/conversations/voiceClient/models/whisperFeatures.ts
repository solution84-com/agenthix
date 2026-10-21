/**
 * Whisper's log-mel features, as Smart Turn's reference feeds them (`WhisperFeatureExtractor(chunk_length=8)` with
 * `do_normalize=True`, its NumPy path): the waveform normalised to zero mean and unit variance, a 400-point
 * periodic-Hann STFT every 160 samples with reflected edges, power through 80 Slaney mel filters (0–8 kHz), log10
 * floored at 1e-10, the last frame dropped, everything floored at 8 below the maximum, then (x + 4) / 4.
 */
import { createFft } from './fft'

const RATE = 16000
const N_FFT = 400
const HOP = 160
const BINS = N_FFT / 2 + 1
export const MEL_BANDS = 80

/** Slaney's mel scale: linear below 1 kHz, logarithmic above. */
function hertzToMel(hz: number): number {
  return hz < 1000 ? (3 * hz) / 200 : 15 + Math.log(hz / 1000) * (27 / Math.log(6.4))
}

function melToHertz(mel: number): number {
  return mel < 15 ? (200 * mel) / 3 : 1000 * Math.exp((Math.log(6.4) / 27) * (mel - 15))
}

/** The filters as `[band][bin]`, Slaney-normalised: each triangle's area is constant. */
export function melFilterBank(): Float64Array[] {
  const melMax = hertzToMel(RATE / 2)
  const edges = Array.from({ length: MEL_BANDS + 2 }, (_, i) => melToHertz((melMax * i) / (MEL_BANDS + 1)))
  const bands: Float64Array[] = []
  for (let m = 0; m < MEL_BANDS; m++) {
    const [lo, mid, hi] = [edges[m]!, edges[m + 1]!, edges[m + 2]!]
    const band = new Float64Array(BINS)
    const norm = 2 / (hi - lo)
    for (let b = 0; b < BINS; b++) {
      const hz = (b * (RATE / 2)) / (BINS - 1)
      const weight = Math.min((hz - lo) / (mid - lo), (hi - hz) / (hi - mid))
      band[b] = Math.max(0, weight) * norm
    }
    bands.push(band)
  }
  return bands
}

type Band = { from: number; weights: Float64Array }

function sparseBands(): Band[] {
  return melFilterBank().map((band) => {
    let from = band.findIndex((w) => w > 0)
    if (from < 0) from = 0
    let to = band.length
    while (to > from && band[to - 1] === 0) to--
    return { from, weights: band.slice(from, to) }
  })
}

let shared: { bands: Band[]; window: Float64Array; fft: ReturnType<typeof createFft> } | null = null

function tables() {
  shared ??= {
    bands: sparseBands(),
    window: Float64Array.from({ length: N_FFT }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT)),
    fft: createFft(N_FFT),
  }
  return shared
}

function normalise(audio: Float32Array): Float64Array {
  let sum = 0
  for (let i = 0; i < audio.length; i++) sum += audio[i]!
  const mean = sum / audio.length
  let variance = 0
  for (let i = 0; i < audio.length; i++) variance += (audio[i]! - mean) ** 2
  const scale = 1 / Math.sqrt(variance / audio.length + 1e-7)
  return Float64Array.from(audio, (x) => (x - mean) * scale)
}

/** NumPy's `reflect` padding: the edge sample itself is not repeated. */
function reflectPad(x: Float64Array, pad: number): Float64Array {
  const out = new Float64Array(x.length + 2 * pad)
  out.set(x, pad)
  for (let i = 0; i < pad; i++) {
    out[pad - 1 - i] = x[i + 1]!
    out[pad + x.length + i] = x[x.length - 2 - i]!
  }
  return out
}

/** The features of `audio` (16 kHz), as `MEL_BANDS` rows of `frames` values, row-major. */
export function whisperLogMel(audio: Float32Array): { data: Float32Array; frames: number } {
  const { bands, window, fft } = tables()
  const padded = reflectPad(normalise(audio), N_FFT / 2)
  const frames = Math.floor((padded.length - N_FFT) / HOP) + 1 - 1
  const data = new Float32Array(MEL_BANDS * frames)
  const frame = new Float64Array(N_FFT)
  const re = new Float64Array(N_FFT)
  const im = new Float64Array(N_FFT)
  const power = new Float64Array(BINS)
  let max = -Infinity
  for (let t = 0; t < frames; t++) {
    for (let n = 0; n < N_FFT; n++) frame[n] = padded[t * HOP + n]! * window[n]!
    fft.transform(frame, null, re, im)
    for (let b = 0; b < BINS; b++) power[b] = re[b]! * re[b]! + im[b]! * im[b]!
    for (let m = 0; m < MEL_BANDS; m++) {
      const { from, weights } = bands[m]!
      let energy = 0
      for (let i = 0; i < weights.length; i++) energy += weights[i]! * power[from + i]!
      const value = Math.log10(Math.max(energy, 1e-10))
      data[m * frames + t] = value
      if (value > max) max = value
    }
  }
  const floor = max - 8
  for (let i = 0; i < data.length; i++) data[i] = (Math.max(data[i]!, floor) + 4) / 4
  return { data, frames }
}
