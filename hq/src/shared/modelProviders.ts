/**
 * The model providers a boundary can hold a credential for (spec §6), shared by
 * the settings page and the server. The names are core's `CREDENTIAL_PROVIDERS`,
 * which are also `ModelCredential.provider`'s values and the org's `Provider`
 * row names under the `llm` service.
 */
import { CREDENTIAL_PROVIDERS, type CredentialProvider } from '@agenthix/core'

export { CREDENTIAL_PROVIDERS, type CredentialProvider }

export const PROVIDER_LABELS: Record<CredentialProvider, string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  openai_compatible: 'OpenAI-compatible endpoint',
}

/** The one provider whose credential is an endpoint: a base URL, and a key only if the endpoint needs one. */
export const COMPATIBLE_ENDPOINT = 'openai_compatible' as const

export function isCredentialProvider(value: unknown): value is CredentialProvider {
  return typeof value === 'string' && (CREDENTIAL_PROVIDERS as readonly string[]).includes(value)
}

/**
 * An OpenAI-compatible endpoint's base URL as stored, or why it is refused. Only
 * http and https, and no user name or password in it: the URL is shown back on
 * the settings page, so a secret written into it would be shown too.
 */
export function checkBaseUrl(raw: string): { baseUrl: string } | { problem: string } {
  const value = raw.trim()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { problem: 'The base URL is not a valid address' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { problem: 'The base URL must start with http:// or https://' }
  if (url.username || url.password) return { problem: 'Put the key in the key field, not in the base URL' }
  return { baseUrl: value }
}
