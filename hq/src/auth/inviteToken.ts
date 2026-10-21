import { createHash, randomBytes } from 'node:crypto'

// The token is shown to the admin once, at creation; only its hash is stored. It is
// 256 bits of randomness, so a plain SHA-256 is enough — there is nothing to
// brute-force, and a lookup by the hash needs no salt.
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
