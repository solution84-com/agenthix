/**
 * At-rest secret encryption (AES-256-GCM) — the site's copy of hq's
 * hq/src/server/crypto/secretCrypto.ts, same cipher, same key setting, same
 * stored format. The two apps never import each other, so it is copied rather
 * than shared.
 *
 * Key: env SECRETS_MASTER_KEY (base64, 32 bytes), this site's own — not hq's.
 * Env-held, so a read of the site's database alone yields no working credential.
 * Format: base64(iv) . base64(authTag) . base64(ciphertext).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

/** Why the master key cannot be used, or null when it can. */
export function masterKeyProblem(raw: string | undefined = process.env.SECRETS_MASTER_KEY): string | null {
  if (!raw) return 'SECRETS_MASTER_KEY is not set — required to encrypt/decrypt stored secrets.'
  if (Buffer.from(raw, 'base64').length !== 32) return 'SECRETS_MASTER_KEY must be 32 bytes (base64-encoded).'
  return null
}

function masterKey(): Buffer {
  const problem = masterKeyProblem()
  if (problem) throw new Error(problem)
  return Buffer.from(process.env.SECRETS_MASTER_KEY as string, 'base64')
}

/** Whether a stored value has the encrypted shape — three non-empty base64 runs. */
export function looksEncrypted(stored: string): boolean {
  const parts = stored.split('.')
  return parts.length === 3 && parts.every(p => p.length > 0 && /^[A-Za-z0-9+/=]+$/.test(p))
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, masterKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, ctB64] = stored.split('.')
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted secret.')
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}
