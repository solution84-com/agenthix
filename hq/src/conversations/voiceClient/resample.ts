/** The rate the speech service is told it is sent. */
export const SPEECH_RATE = 16000

/**
 * Turns the microphone's audio, at whatever rate the AudioContext really runs, into 16 kHz. A context asked for
 * 16000 Hz may still run at the device's rate, and audio sent at 48 kHz but labelled 16 kHz plays three times too
 * slow to the service. Each output sample averages the input it covers (a plain low-pass before dropping samples);
 * when the context runs slower than 16 kHz, neighbours are interpolated. State carries across chunks.
 */
export function createResampler(from: number, to: number = SPEECH_RATE): (input: Float32Array) => Float32Array {
  if (!from || from === to) return (input) => input
  const step = from / to
  let carry = new Float32Array(0)
  let pos = 0
  return (input) => {
    const buf = new Float32Array(carry.length + input.length)
    buf.set(carry)
    buf.set(input, carry.length)
    const out: number[] = []
    while (Math.floor(pos + Math.max(step, 1)) < buf.length) {
      const i = Math.floor(pos)
      if (step >= 1) {
        const j = Math.max(i + 1, Math.floor(pos + step))
        let sum = 0
        for (let k = i; k < j; k++) sum += buf[k]!
        out.push(sum / (j - i))
      } else {
        const f = pos - i
        out.push(buf[i]! * (1 - f) + buf[i + 1]! * f)
      }
      pos += step
    }
    const keep = Math.floor(pos)
    carry = buf.slice(keep)
    pos -= keep
    return Float32Array.from(out)
  }
}
