// hq's own signing key, read from hq's test database and decrypted with hq's master key, so a test can make a ticket
// or a pass that only one field tells apart from one hq made: one for another site, one past its expiry. hq stores the
// key encrypted (hq/src/server/identity/signingKeyService.ts, server/crypto/secretCrypto.ts: AES-256-GCM,
// `iv.tag.ciphertext` in base64); this reads it the same way. Used only against the harness's own test database.
import { createDecipheriv, createPrivateKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { hqDb } from './db'
import { HQ_SECRETS_MASTER_KEY } from './env'

type SigningKey = { kid: string; key: KeyObject }
type Claims = Record<string, unknown>

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')

function decrypt(stored: string): string {
  if (!HQ_SECRETS_MASTER_KEY) throw new Error("hq's SECRETS_MASTER_KEY is in neither the environment nor hq/.env.server")
  const [iv, tag, ct] = stored.split('.').map(p => Buffer.from(p, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(HQ_SECRETS_MASTER_KEY, 'base64'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** The key hq signs tickets and passes with, as it is now in hq's database. */
export async function hqSigningKey(): Promise<SigningKey> {
  const row = await hqDb.siteSecret.findUniqueOrThrow({ where: { type: 'HQ_SIGNING_KEY' } })
  const stored = JSON.parse(row.value) as { kid: string; privatePkcs8Enc: string }
  return { kid: stored.kid, key: createPrivateKey(decrypt(stored.privatePkcs8Enc)) }
}

/** A key hq never held, under hq's own key id: what a forger would sign with. */
export function strangerKey(kid: string): SigningKey {
  return { kid, key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }
}

/** A compact JWS (RS256), as hq signs one. */
export function signToken(claims: Claims, { kid, key }: SigningKey): string {
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))}.${b64url(JSON.stringify(claims))}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`
}

/** A token's claims, read without checking it. */
export function claimsOf(token: string): Claims {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Claims
}

/** The ticket in a relay link (`…/t/<ticket>`). */
export function ticketOf(link: string): string {
  const ticket = new URL(link).pathname.split('/t/')[1]
  if (!ticket) throw new Error(`not a ticket link: ${link}`)
  return ticket
}

/** The same token with some claims changed and the original signature kept: a ticket someone altered. */
export function altered(token: string, changes: Claims): string {
  const [header, , signature] = token.split('.')
  return `${header}.${b64url(JSON.stringify({ ...claimsOf(token), ...changes }))}.${signature}`
}
