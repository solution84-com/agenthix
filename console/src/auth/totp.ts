/** RFC 6238 time-based codes as authenticator apps make them: HMAC-SHA-1, 6 digits, a 30-second step. */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TOTP_STEP_MS = 30_000
/** One step either side, for a phone's clock a little off and a code typed as it changed. */
const DRIFT_STEPS = 1

export function base32Decode(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of text.toUpperCase().replace(/=+$/, '')) {
    const i = alphabet.indexOf(c)
    if (i < 0) throw new Error('not base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** RFC 4226's HOTP for one counter. */
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', key).update(message).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  const n = mac.readUInt32BE(offset) & 0x7fffffff
  return String(n % 1_000_000).padStart(6, '0')
}

/** The step a valid code was made in, near `now`, or null. The caller refuses a step it has already taken. */
export function totpStep(secret: string, code: string, now: number): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const key = base32Decode(secret)
  const step = Math.floor(now / TOTP_STEP_MS)
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    if (timingSafeEqual(Buffer.from(hotp(key, step + d)), Buffer.from(code))) return step + d
  }
  return null
}
