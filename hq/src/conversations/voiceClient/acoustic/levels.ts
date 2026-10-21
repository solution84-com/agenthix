/** Measures of a piece of 16-bit audio that Acoustic's components share. */

const FULL_SCALE = 32768

/** Mean power in dB relative to full scale; -120 for digital silence. */
export function powerDb(pcm: Int16Array, from = 0, to = pcm.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += (pcm[i]! / FULL_SCALE) ** 2
  return sum === 0 ? -120 : Math.max(-120, 10 * Math.log10(sum / Math.max(1, to - from)))
}

/** Root mean square amplitude, 0 to 1. */
export function amplitude(pcm: Int16Array, from = 0, to = pcm.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += (pcm[i]! / FULL_SCALE) ** 2
  return Math.sqrt(sum / Math.max(1, to - from))
}

/**
 * The power of the sample-to-sample difference over the power of the signal: near 0 when the sound is all low
 * frequencies (wind, rumble), about 2 for white noise. A cheap stand-in for a spectrum.
 */
export function brightness(pcm: Int16Array): number {
  let power = 0
  let change = 0
  for (let i = 0; i < pcm.length; i++) {
    power += pcm[i]! ** 2
    if (i > 0) change += (pcm[i]! - pcm[i - 1]!) ** 2
  }
  return power === 0 ? 0 : change / power
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}
