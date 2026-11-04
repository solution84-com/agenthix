/**
 * At-rest secret encryption (AES-256-GCM).
 * Dedicated master key from env SECRETS_MASTER_KEY (base64, 32 bytes) — kept separate
 * from SITE_ADMIN_KEY so encryption is decoupled from M2M-auth-key rotation (BL-006).
 * Env-held (a DB leak alone can't decrypt); decrypt only in server memory at use.
 * Format: base64(iv) . base64(authTag) . base64(ciphertext).
 * Used for every credential hq stores that it must read back: the GitHub App private key,
 * client secret and webhook secret, provider keys, model credentials, the token-signing
 * key and the JWT signing secret. A credential hq only has to recognise is hashed instead.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Logger } from '../utils/logger'

const logger = new Logger('Secrets')

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
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'), { authTagLength: TAG_BYTES })
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Bound encryption, for values whose row must not lend them to another: the associated data (for a place's secret,
 * its id and its place) is authenticated with the value, so a ciphertext copied into another row or place fails to
 * decrypt instead of being used. Bytes in, bytes out, for a database `Bytes` column.
 * Format: one format byte (1), the 12-byte IV, the 16-byte auth tag, then the ciphertext.
 */
const BOUND_FORMAT = 1
const IV_BYTES = 12
const TAG_BYTES = 16

export function encryptBytesBound(plain: Uint8Array, associatedData: string): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, masterKey(), iv)
  cipher.setAAD(Buffer.from(associatedData, 'utf8'))
  const ct = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([Buffer.from([BOUND_FORMAT]), iv, cipher.getAuthTag(), ct])
}

export function decryptBytesBound(stored: Uint8Array, associatedData: string): Buffer {
  const buf = Buffer.from(stored)
  if (buf.length < 1 + IV_BYTES + TAG_BYTES || buf[0] !== BOUND_FORMAT) throw new Error('Malformed encrypted secret.')
  const decipher = createDecipheriv(ALGO, masterKey(), buf.subarray(1, 1 + IV_BYTES))
  decipher.setAAD(Buffer.from(associatedData, 'utf8'))
  decipher.setAuthTag(buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(buf.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()])
}

/** Whether a stored value has the encrypted shape — three non-empty base64 runs. */
export function looksEncrypted(stored: string): boolean {
  const parts = stored.split('.')
  return parts.length === 3 && parts.every(p => p.length > 0 && /^[A-Za-z0-9+/=]+$/.test(p))
}

const warnedPlaintext = new Set<string>()

/**
 * Decrypts a stored secret, or null for one stored in the clear before it was
 * encrypted. Such a value is never converted and never used: it reads as
 * absent, so the person enters it again, and it is logged once per `what`
 * (never the value). A value that looks encrypted but will not decrypt still
 * throws — failing open would hand a broken credential to whatever uses it.
 */
export function decryptStoredSecret(stored: string, what: string): string | null {
  if (!looksEncrypted(stored)) {
    if (!warnedPlaintext.has(what)) {
      warnedPlaintext.add(what)
      logger.warn(`A stored ${what} is in the clear, from before it was encrypted; it is ignored and must be entered again.`)
    }
    return null
  }
  return decryptSecret(stored)
}
