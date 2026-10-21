import { describe, expect, it } from 'vitest'
import { createFft } from '../fft'

function naiveDft(re: Float64Array, im: Float64Array) {
  const n = re.length
  const outRe = new Float64Array(n)
  const outIm = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n
      outRe[k] += re[t]! * Math.cos(a) - im[t]! * Math.sin(a)
      outIm[k] += re[t]! * Math.sin(a) + im[t]! * Math.cos(a)
    }
  }
  return { outRe, outIm }
}

describe('the mixed-radix FFT', () => {
  it.each([1, 8, 15, 49, 400])('matches the plain DFT at length %i', (n) => {
    let seed = n
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1
    const re = Float64Array.from({ length: n }, random)
    const im = Float64Array.from({ length: n }, random)
    const outRe = new Float64Array(n)
    const outIm = new Float64Array(n)
    createFft(n).transform(re, im, outRe, outIm)
    const expected = naiveDft(re, im)
    for (let k = 0; k < n; k++) {
      expect(outRe[k]).toBeCloseTo(expected.outRe[k]!, 9)
      expect(outIm[k]).toBeCloseTo(expected.outIm[k]!, 9)
    }
  })

  it('treats a missing imaginary part as zero', () => {
    const re = Float64Array.from({ length: 400 }, (_, i) => Math.sin(i / 7))
    const a = { re: new Float64Array(400), im: new Float64Array(400) }
    const b = { re: new Float64Array(400), im: new Float64Array(400) }
    const fft = createFft(400)
    fft.transform(re, null, a.re, a.im)
    fft.transform(re, new Float64Array(400), b.re, b.im)
    expect(Array.from(a.re)).toEqual(Array.from(b.re))
    expect(Array.from(a.im)).toEqual(Array.from(b.im))
  })
})
