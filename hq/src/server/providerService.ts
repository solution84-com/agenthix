import { prisma } from 'wasp/server'
import type { CredentialProvider } from '@agenthix/core'
import { encryptSecret, decryptStoredSecret, looksEncrypted } from './crypto/secretCrypto'
import { Logger } from './utils/logger'

const logger = new Logger('Providers')

export { looksEncrypted }

export type LlmProvider = CredentialProvider

/** The org's model keys are Provider rows under this service, one per provider (spec §6). */
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

export async function getLlmApiKey(name: LlmProvider): Promise<string | null> {
  return getProviderKey('llm', name)
}

// Seed from env var on boot — no-op if the row already exists (never
// overwrites a key the user configured through the UI).
//
// hq refuses to start without SECRETS_MASTER_KEY (envValidation.ts), so the
// guard below should never fire; it stays so that a seed, which is a
// convenience, can never become a boot crash if that check is bypassed. The
// key then stays in the environment and the row is written on the first boot
// that has a master key. Returns whether it wrote anything, so the caller can
// say what happened.
export async function seedLlmApiKey(name: LlmProvider, value: string): Promise<boolean> {
  const existing = await prisma.provider.findUnique({ where: { service_name: { service: 'llm', name } } })
  if (existing) return false
  if (!process.env.SECRETS_MASTER_KEY) {
    logger.warn(
      `SECRETS_MASTER_KEY not set — ${name} key left in the environment, not stored; set it and restart to store the key.`,
    )
    return false
  }
  await setProviderKey('llm', name, value)
  return true
}

// ── The org's model credentials, per provider (spec §6) ─────────────────────
//
// An OpenAI-compatible endpoint is the one provider whose row can hold no key:
// its base URL is in `config.baseUrl`, and an endpoint that needs no key keeps
// `apiKey` empty. Every other provider's row is a key and nothing else.

export type OrgModelKey = { apiKey: string; baseUrl?: string }

function baseUrlOf(config: unknown): string | null {
  const value = config && typeof config === 'object' ? (config as Record<string, unknown>).baseUrl : null
  return typeof value === 'string' && value ? value : null
}

/** The org's credential for one provider, or null when it has none it can use. */
export async function getOrgModelKey(provider: CredentialProvider): Promise<OrgModelKey | null> {
  const row = await prisma.provider.findUnique({ where: { service_name: { service: MODEL_KEY_SERVICE, name: provider } } })
  if (!row) return null
  if (provider !== 'openai_compatible') {
    const apiKey = decryptProviderKey(row.apiKey)
    return apiKey ? { apiKey } : null
  }
  const baseUrl = baseUrlOf(row.config)
  if (!baseUrl) return null
  if (row.apiKey === '') return { apiKey: '', baseUrl }
  // A key stored in the clear reads as none; sending the endpoint without the
  // key it was saved with would fail less clearly than asking for it again.
  const apiKey = decryptProviderKey(row.apiKey)
  return apiKey ? { apiKey, baseUrl } : null
}

/** What the settings page may see of the org's credential for one provider: never the key. */
export async function getOrgModelKeyStatus(provider: CredentialProvider): Promise<{ present: boolean; baseUrl: string | null; hasKey: boolean }> {
  const row = await prisma.provider.findUnique({
    where: { service_name: { service: MODEL_KEY_SERVICE, name: provider } },
    select: { apiKey: true, config: true },
  })
  if (!row) return { present: false, baseUrl: null, hasKey: false }
  return { present: true, baseUrl: provider === 'openai_compatible' ? baseUrlOf(row.config) : null, hasKey: row.apiKey !== '' }
}

/**
 * Stores the org's credential for one provider. `apiKey` may be empty only for
 * an OpenAI-compatible endpoint, which alone takes a `baseUrl` and requires one.
 */
export async function setOrgModelKey(provider: CredentialProvider, apiKey: string, baseUrl?: string): Promise<void> {
  if (provider !== 'openai_compatible') {
    if (baseUrl) throw new Error('setOrgModelKey: only an OpenAI-compatible endpoint takes a base URL')
    await setProviderKey(MODEL_KEY_SERVICE, provider, apiKey)
    return
  }
  if (!baseUrl) throw new Error('setOrgModelKey: an OpenAI-compatible endpoint needs a base URL')
  const data = { apiKey: apiKey ? encryptProviderKey(apiKey) : '', config: { baseUrl } }
  await prisma.provider.upsert({
    where: { service_name: { service: MODEL_KEY_SERVICE, name: provider } },
    create: { service: MODEL_KEY_SERVICE, name: provider, ...data },
    update: data,
  })
}

export async function deleteOrgModelKey(provider: CredentialProvider): Promise<void> {
  await prisma.provider.deleteMany({ where: { service: MODEL_KEY_SERVICE, name: provider } })
}

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
