import crypto from 'node:crypto'
import { prisma } from 'wasp/server'
import { encryptSecret, looksEncrypted } from './crypto/secretCrypto'
import { Logger } from './utils/logger'

const logger = new Logger('startup')

// HQ_SIGNING_KEY is managed by identity/signingKeyService, not here. A row of any
// other type — the retired org-wide 'MCP' key (adr-0090) — is never read.
export type SiteSecretType = 'JWT_SIGNING_SECRET'

// The JWT signing secret must be read back to sign with, so it is stored
// encrypted (secretCrypto). A row in the clear predates this and is replaced.

/** Mints a new value, stores it encrypted, and returns it. */
export async function generateSiteSecret(type: SiteSecretType): Promise<string> {
  const value = crypto.randomBytes(32).toString('hex')
  const stored = encryptSecret(value)
  await prisma.siteSecret.upsert({
    where: { type },
    create: { type, value: stored, prefix: null },
    update: { value: stored, prefix: null },
  })
  return value
}

// Generate a secret on boot if there is none, or if the one stored is in the
// clear (it is replaced, not converted). Returns the value if newly generated,
// null if a usable row already existed.
export async function ensureSiteSecret(type: SiteSecretType): Promise<string | null> {
  const existing = await prisma.siteSecret.findUnique({ where: { type } })
  if (existing && looksEncrypted(existing.value)) return null
  if (existing) logger.warn(`The stored ${type} secret was in the clear; replacing it with a new one.`)
  return generateSiteSecret(type)
}
