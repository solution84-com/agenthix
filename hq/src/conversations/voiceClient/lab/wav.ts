/** 16-bit mono PCM in a WAV container, the form the recordings are measured from. */
export function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = pcm.length * 2
  const out = new Uint8Array(44 + bytes)
  const view = new DataView(out.buffer)
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)) }
  text(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, bytes, true)
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + 2 * i, pcm[i]!, true)
  return out
}

export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const c = Math.max(-1, Math.min(1, samples[i]!))
    out[i] = c < 0 ? c * 0x8000 : c * 0x7fff
  }
  return out
}
