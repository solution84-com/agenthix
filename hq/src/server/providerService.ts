import { prisma } from 'wasp/server'
import { encryptSecret, decryptStoredSecret, looksEncrypted } from './crypto/secretCrypto'

export { looksEncrypted }

/**
 * The service the organisation's model keys were stored under, before providers moved to `AiProvider` (models from one
 * place). Nothing is stored under it now; the boot pass still names it to discard old rows.
 */
export const MODEL_KEY_SERVICE = 'llm'
/** The org's web-search key (Exa) is the Provider row `('search', 'exa')`. */
export const WEB_SEARCH_SERVICE = 'search'
export const WEB_SEARCH_PROVIDER = 'exa'

// ── At-rest encryption for Provider.apiKey ──────────────────────────────────
// This module is the one door onto Provider.apiKey: every reader and writer
// in this codebase goes through the functions below rather than touching the
// column directly. secretCrypto.ts owns the cipher itself (AES-256-GCM under
// SECRETS_MASTER_KEY); this module owns the display mask.

/**
 * Decrypts an already-fetched Provider.apiKey value. A value stored in the
 * clear, before encryption, is not a key hq will use: it reads as '' — no key —
 * so every caller's "not configured" path applies and the person enters it
 * again. The boot pass (boot/discardPlaintextSecrets.ts) removes such rows.
 * A value that DOES look encrypted but fails to decrypt — wrong
 * SECRETS_MASTER_KEY, a corrupted row — throws rather than handing back the
 * ciphertext as though it were a working key.
 */
export function decryptProviderKey(stored: string): string {
  try {
    return decryptStoredSecret(stored, 'provider key') ?? ''
  } catch (err) {
    throw new Error(
      `Provider key looks encrypted but could not be decrypted — wrong SECRETS_MASTER_KEY or a corrupted row: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** Encrypts a value for storage in Provider.apiKey. The one place in this
 *  codebase that calls secretCrypto's encryptSecret for this column. */
export function encryptProviderKey(value: string): string {
  return encryptSecret(value)
}

/** Last four characters only, for display. Returning the key in full (or a
 *  long prefix) to the client is the same failure as storing it in the
 *  clear — the settings page only needs to show that a key is set. */
export function maskProviderKey(stored: string): string {
  const plain = decryptProviderKey(stored)
  if (!plain) return 'not set — enter it again'
  return `••••${plain.slice(-4)}`
}

// ── DB-touching pair ─────────────────────────────────────────────────────────

export async function getProviderKey(service: string, name: string): Promise<string | null> {
  const row = await prisma.provider.findUnique({ where: { service_name: { service, name } } })
  if (!row) return null
  return decryptProviderKey(row.apiKey) || null
}

export async function setProviderKey(service: string, name: string, value: string): Promise<void> {
  // An empty secret encrypts to an empty third base64 run (`iv.tag.`), which
  // looksEncrypted then reads as false — so a future read would treat the
  // key just saved as absent, and the boot pass would remove it. Callers
  // already reject an empty key before reaching here; this guard closes the
  // shape for any caller that doesn't.
  if (!value) throw new Error('setProviderKey: value must not be empty')
  const apiKey = encryptProviderKey(value)
  const existing = await prisma.provider.findUnique({ where: { service_name: { service, name } } })
  if (existing) {
    await prisma.provider.update({ where: { service_name: { service, name } }, data: { apiKey } })
  } else {
    await prisma.provider.create({ data: { service, name, apiKey } })
  }
}

// ── LLM API keys — thin wrappers over the pair above; callers untouched ────

/** The org's Exa key, sent to the site with each OpenCode turn for its `web_search` tool. */
export async function getWebSearchKey(): Promise<string | null> {
  return getProviderKey(WEB_SEARCH_SERVICE, WEB_SEARCH_PROVIDER)
}

export async function setWebSearchKey(value: string): Promise<void> {
  await setProviderKey(WEB_SEARCH_SERVICE, WEB_SEARCH_PROVIDER, value)
}

export async function deleteWebSearchKey(): Promise<void> {
  await prisma.provider.deleteMany({ where: { service: WEB_SEARCH_SERVICE, name: WEB_SEARCH_PROVIDER } })
}

export async function hasWebSearchKey(): Promise<boolean> {
  const row = await prisma.provider.findUnique({
    where: { service_name: { service: WEB_SEARCH_SERVICE, name: WEB_SEARCH_PROVIDER } },
    select: { id: true },
  })
  return row !== null
}
