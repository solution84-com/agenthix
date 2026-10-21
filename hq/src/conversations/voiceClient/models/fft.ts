/**
 * A mixed-radix FFT for one fixed length, here Whisper's 400-point frame (2·2·2·2·5·5), which a power-of-two FFT
 * cannot do. Recursive decimation in time over the length's prime factors; twiddles computed once per length.
 */

function primeFactors(n: number): number[] {
  const factors: number[] = []
  for (let p = 2; n > 1; p++) {
    while (n % p === 0) { factors.push(p); n /= p }
  }
  return factors
}

export type Fft = {
  /** The complex spectrum of `re` (and `im`, zero when absent), written into `outRe` and `outIm`. */
  transform: (re: Float64Array, im: Float64Array | null, outRe: Float64Array, outIm: Float64Array) => void
}

export function createFft(size: number): Fft {
  const factors = primeFactors(size)
  const cos = new Float64Array(size)
  const sin = new Float64Array(size)
  for (let j = 0; j < size; j++) {
    cos[j] = Math.cos((-2 * Math.PI * j) / size)
    sin[j] = Math.sin((-2 * Math.PI * j) / size)
  }
  const maxRadix = Math.max(1, ...factors)
  const tRe = new Float64Array(maxRadix)
  const tIm = new Float64Array(maxRadix)
  let inRe: Float64Array = cos
  let inIm: Float64Array | null = null
  let oRe: Float64Array = cos
  let oIm: Float64Array = sin

  const rec = (n: number, stride: number, inOff: number, outOff: number, level: number): void => {
    if (n === 1) {
      oRe[outOff] = inRe[inOff]!
      oIm[outOff] = inIm ? inIm[inOff]! : 0
      return
    }
    const p = factors[level]!
    const m = n / p
    for (let q = 0; q < p; q++) rec(m, stride * p, inOff + q * stride, outOff + q * m, level + 1)
    const step = size / n
    const rootStep = size / p
    for (let k = 0; k < m; k++) {
      // Each sub-transform's k-th value, turned by its twiddle, then a p-point DFT across them.
      for (let q = 0; q < p; q++) {
        const at = outOff + q * m + k
        const w = (q * k * step) % size
        const yr = oRe[at]!
        const yi = oIm[at]!
        tRe[q] = yr * cos[w]! - yi * sin[w]!
        tIm[q] = yr * sin[w]! + yi * cos[w]!
      }
      for (let s = 0; s < p; s++) {
        let sr = 0
        let si = 0
        for (let q = 0; q < p; q++) {
          const w = ((q * s) % p) * rootStep
          sr += tRe[q]! * cos[w]! - tIm[q]! * sin[w]!
          si += tRe[q]! * sin[w]! + tIm[q]! * cos[w]!
        }
        oRe[outOff + k + s * m] = sr
        oIm[outOff + k + s * m] = si
      }
    }
  }

  return {
    transform(re, im, outRe, outIm) {
      inRe = re
      inIm = im
      oRe = outRe
      oIm = outIm
      rec(size, 1, 0, 0, 0)
    },
  }
}
