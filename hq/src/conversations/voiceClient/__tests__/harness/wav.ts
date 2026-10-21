import { readFileSync } from 'node:fs'

export const WAV_SAMPLE_RATE = 16_000

/** Reads a 16 kHz mono PCM16 WAV; anything else is refused, so a wrong recording fails loudly instead of replaying wrong. */
export function parseWav(bytes: Uint8Array): Int16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file')
  let format: { format: number; channels: number; rate: number; bits: number } | null = null
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (tag(at) === 'fmt ') {
      format = {
        format: view.getUint16(body, true), channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true),
      }
    } else if (tag(at) === 'data') {
      if (!format) throw new Error('WAV has no fmt chunk before its data')
      if (format.format !== 1 || format.bits !== 16) throw new Error('WAV must be PCM16')
      if (format.channels !== 1) throw new Error('WAV must be mono')
      if (format.rate !== WAV_SAMPLE_RATE) throw new Error(`WAV must be 16 kHz, got ${format.rate}`)
      const length = Math.min(size, bytes.length - body) >> 1
      const out = new Int16Array(length)
      for (let i = 0; i < length; i++) out[i] = view.getInt16(body + i * 2, true)
      return out
    }
    at = body + size + (size & 1)
  }
  throw new Error('WAV has no data chunk')
}

export function readWavFile(path: string): Int16Array {
  return parseWav(readFileSync(path))
}

/** Encodes 16 kHz mono PCM16 as a WAV file's bytes (for generating synthetic audio in tests). */
export function encodeWav(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(out.buffer)
  const put = (at: number, text: string) => { for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i) }
  put(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); put(8, 'WAVE')
  put(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, WAV_SAMPLE_RATE, true); view.setUint32(28, WAV_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  put(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true))
  return out
}

/** A sine tone, for synthetic audio. */
export function tone(ms: number, hz = 220, amplitude = 8_000): Int16Array {
  const out = new Int16Array(Math.round((ms * WAV_SAMPLE_RATE) / 1000))
  for (let i = 0; i < out.length; i++) out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * hz * i) / WAV_SAMPLE_RATE))
  return out
}

export const silence = (ms: number): Int16Array => new Int16Array(Math.round((ms * WAV_SAMPLE_RATE) / 1000))

export function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
