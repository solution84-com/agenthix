import crypto from 'node:crypto'

/**
 * Issuance and verification of a site's lasting machine credential (spec §3).
 *
 * A credential is stored hashed: it is issued once and never re-displayed, so
 * there is nothing to gain from keeping it recoverable and a database dump
 * to lose by it. A person's connection token is hashed the same way (adr-0090).
 */

export function generateCredential(prefix: string): { value: string; prefix: string } {
  const value = `${prefix}_${crypto.randomBytes(4).toString('hex')}_${crypto.randomBytes(24).toString('hex')}`
  return { value, prefix: value.slice(0, 16) }
}

export function hashCredential(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** A SHA-256 digest, hex-encoded — exactly what hashCredential produces. */
const SHA256_HEX = /^[0-9a-f]{64}$/i

/**
 * Timing-safe. Returns false rather than throwing on a null, empty or malformed
 * stored hash. Two separate hazards: `crypto.timingSafeEqual` raises on unequal
 * buffer lengths, and `Buffer.from(s, 'hex')` decodes leniently — it consumes
 * every valid pair and silently ignores trailing garbage, so a correct digest
 * with junk appended would otherwise decode to the same 32 bytes and pass. The
 * shape check closes that; the length check stays as a second line.
 */
export function credentialMatches(provided: string, storedHash: string | null): boolean {
  if (!storedHash || !SHA256_HEX.test(storedHash)) return false
  const a = Buffer.from(hashCredential(provided), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length || b.length === 0) return false
  return crypto.timingSafeEqual(a, b)
}
