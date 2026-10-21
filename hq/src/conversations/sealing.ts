/**
 * Encryption at rest for what people and agents write in a conversation (conversational experience spec, Where
 * a conversation's record lives): the same key and cipher as every secret hq stores. A value that will not open
 * is an error, never read as text.
 */
import { decryptSecret, encryptSecret } from '../server/crypto/secretCrypto'

export function sealText(plain: string): string {
  return encryptSecret(plain)
}

export function openText(sealed: string): string {
  return decryptSecret(sealed)
}

export function sealJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value))
}

export function openJson<T>(sealed: string): T {
  return JSON.parse(decryptSecret(sealed)) as T
}
