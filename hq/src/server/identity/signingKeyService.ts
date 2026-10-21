/**
 * HQ token-signing keypair (hq/site split spec §2).
 * RSA-2048 / RS256 — same proven jose pattern as the GitHub App signer
 * (github/githubApp.ts). Private key encrypted at rest via secretCrypto
 * (needs SECRETS_MASTER_KEY), stored as SiteSecret type 'HQ_SIGNING_KEY':
 *   value = JSON { kid, publicJwk, privatePkcs8Enc }.
 * kid is the RFC 7638 JWK thumbprint — the rotation hook; no rotation flow yet.
 */
import { generateKeyPairSync } from 'node:crypto'
import { exportJWK, importPKCS8, calculateJwkThumbprint, type JWK, type CryptoKey } from 'jose'
import { prisma } from 'wasp/server'
import { encryptSecret, decryptSecret } from '../crypto/secretCrypto'

export const SIGNING_ALG = 'RS256'
const SECRET_TYPE = 'HQ_SIGNING_KEY'

type StoredSigningKey = { kid: string; publicJwk: JWK; privatePkcs8Enc: string }

async function loadStored(): Promise<StoredSigningKey> {
  const row = await prisma.siteSecret.findUnique({ where: { type: SECRET_TYPE } })
  if (!row) throw new Error('HQ signing key not provisioned — set SECRETS_MASTER_KEY and restart hq.')
  return JSON.parse(row.value) as StoredSigningKey
}

/** Boot: create the keypair if missing. Returns true if newly generated. */
export async function ensureHqSigningKey(): Promise<boolean> {
  const existing = await prisma.siteSecret.findUnique({ where: { type: SECRET_TYPE } })
  if (existing) return false
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const value = JSON.stringify({ kid, publicJwk, privatePkcs8Enc: encryptSecret(pkcs8) } satisfies StoredSigningKey)
  // create, not upsert: a concurrent boot must never replace a live signing key.
  // P2002 = unique violation on `type`, meaning another boot won the race.
  try {
    await prisma.siteSecret.create({ data: { type: SECRET_TYPE, value, prefix: null } })
  } catch (err: any) {
    if (err?.code === 'P2002') return false
    throw err
  }
  return true
}

/**
 * The private signing key, decrypted in memory at use (never cached to disk).
 * Re-reads the DB row and re-imports the key on every call — no memoization. If
 * per-run capability minting drives call volume up, a `kid`-keyed in-memory memo
 * is the natural next step; not added here.
 */
export async function getSigningKey(): Promise<{ kid: string; key: CryptoKey }> {
  const stored = await loadStored()
  const key = await importPKCS8(decryptSecret(stored.privatePkcs8Enc), SIGNING_ALG)
  return { kid: stored.kid, key }
}

/** Public key set, JWKS-shaped — served at HQ_JWKS_PATH and used for local verification.
 *  Fields are projected explicitly, never spread: this is a public endpoint and must
 *  never republish whatever happens to be in the stored row. */
export async function getPublicJwks(): Promise<{ keys: JWK[] }> {
  const stored = await loadStored()
  const { kty, n, e } = stored.publicJwk
  return { keys: [{ kty, n, e, kid: stored.kid, alg: SIGNING_ALG, use: 'sig' }] }
}
