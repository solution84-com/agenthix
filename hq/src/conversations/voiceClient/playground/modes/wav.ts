/** Reads a WAV file's samples: 16-bit PCM, mono, any rate (the replay needs 16 kHz). */
export type Wav = { pcm: Int16Array; rate: number }

export function parseWav(buffer: ArrayBuffer): Wav {
  const view = new DataView(buffer)
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(buffer, at, 4))
  if (buffer.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let at = 12
  let rate = 0
  let formatOk = false
  while (at + 8 <= buffer.byteLength) {
    const id = tag(at)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      const format = view.getUint16(body, true)
      const channels = view.getUint16(body + 2, true)
      const bits = view.getUint16(body + 14, true)
      rate = view.getUint32(body + 4, true)
      formatOk = format === 1 && channels === 1 && bits === 16
      if (!formatOk) throw new Error(`The WAV must be 16-bit PCM, mono (it is format ${format}, ${channels} channels, ${bits} bits)`)
    } else if (id === 'data') {
      if (!formatOk) throw new Error('The WAV has its data before its format')
      // A streamed file may claim more than it holds: read what is there.
      const bytes = Math.min(size, buffer.byteLength - body) & ~1
      return { pcm: new Int16Array(buffer.slice(body, body + bytes)), rate }
    }
    at = body + size + (size % 2)
  }
  throw new Error('The WAV has no audio')
}
