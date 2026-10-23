/**
 * Where the site's model relay sends each provider's requests, and how it
 * adds the key (spec §6). The upstream is never taken from the request: a
 * built-in provider's is fixed here, and an OpenAI-compatible endpoint's is
 * its credential's base URL.
 *
 * A harness addresses a provider at `<site>/api/v1/model-relay/<provider>`,
 * and the relay appends whatever path the provider's SDK added to its base.
 * Anthropic's upstream is the bare origin because its two clients disagree
 * on the base: OpenCode's SDK appends `/messages` to a base that ends `/v1`
 * (so OpenCode's configuration adds `/v1`), and Claude Code appends
 * `/v1/messages` to one that does not.
 */
import { CLOUD_BILLING_PROFILE_HEADER, CLOUD_CALL_ID_HEADER, type ApiKeyRunCredential, type CredentialProvider } from '@agenthix/core'
import type { RelayCredential } from './runAccess'

export const MODEL_RELAY_PATH = '/api/v1/model-relay'

/** The header OpenCode's plugin sets on every model request, carrying the turn's relay token. */
export const RELAY_TOKEN_HEADER = 'x-agenthix-turn'

const BUILT_IN_UPSTREAMS: Record<Exclude<CredentialProvider, 'openai_compatible'>, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com',
}

/** The relay's address for a provider, as a harness in a container reaches it. */
export function relayProviderUrl(siteUrl: string, provider: CredentialProvider): string {
  return `${siteUrl}${MODEL_RELAY_PATH}/${provider}`
}

/** The `baseURL` OpenCode's configuration gives a provider. */
export function openCodeProviderBaseUrl(siteUrl: string, provider: CredentialProvider): string {
  return relayProviderUrl(siteUrl, provider) + (provider === 'anthropic' ? '/v1' : '')
}

/**
 * Where this credential's requests go: fixed per built-in provider, the base URL for a compatible endpoint, and
 * Agenthix Cloud's gateway for the API it is spoken to in, over HTTPS only. Null when there is none usable.
 */
export function upstreamBase(credential: RelayCredential): string | null {
  if (credential.kind === 'cloud') return usableBase(credential.baseUrl, ['https:'])
  if (credential.provider !== 'openai_compatible') return BUILT_IN_UPSTREAMS[credential.provider]
  return credential.baseUrl ? usableBase(credential.baseUrl, ['http:', 'https:']) : null
}

function usableBase(base: string, protocols: readonly string[]): string | null {
  try {
    const url = new URL(base)
    if (!protocols.includes(url.protocol) || url.username || url.password) return null
  } catch {
    return null
  }
  return base.replace(/\/+$/, '')
}

/**
 * What a call through Agenthix Cloud's gateway presents: hq's Cloud token, in the header the vendor API it speaks
 * reads, and while `usageBilling` is on, the call's id and its billing profile, so Cloud can report the actual cost.
 */
export function cloudKeyHeaders(
  credential: Extract<RelayCredential, { kind: 'cloud' }>,
  token: string,
  billing: { callId: string; billingProfileId: string | null } | null,
): Record<string, string> {
  const key: Record<string, string> = credential.provider === 'anthropic' ? { 'x-api-key': token } : { authorization: `Bearer ${token}` }
  if (!billing) return key
  return {
    ...key,
    [CLOUD_CALL_ID_HEADER.toLowerCase()]: billing.callId,
    ...(billing.billingProfileId ? { [CLOUD_BILLING_PROFILE_HEADER.toLowerCase()]: billing.billingProfileId } : {}),
  }
}

/** The key, in the header the provider's own API reads it from. A keyless endpoint gets none. */
export function providerKeyHeaders(credential: ApiKeyRunCredential): Record<string, string> {
  const key = credential.apiKey
  switch (credential.provider) {
    case 'anthropic': return { 'x-api-key': key }
    case 'google': return { 'x-goog-api-key': key }
    case 'openai_compatible': return key ? { authorization: `Bearer ${key}` } : {}
    default: return { authorization: `Bearer ${key}` }
  }
}
