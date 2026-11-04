/**
 * Providers (models from one place, part 1): one service the organisation reaches AI through and is billed by. A
 * provider is of one or more types: an LLM provider serves models, an STT provider speech to text, a TTS provider
 * text to speech. Agenthix Cloud is one provider of all three. A model's maker (DeepSeek, reached through OpenRouter)
 * is never a provider.
 *
 * The organisation holds at most one provider of each vendor, written only by hq's provider store and managed by
 * organisation admins in hq's admin area; a person's own Claude subscription is a provider owned by that one person,
 * for their own place only.
 *
 * Nothing here carries a key: what crosses a connection is the provider as reads give it (`AiProviderSummary`), never
 * its credential.
 *
 * The values are spelled as hq stores them (its `AiProvider` table's enums), so no mapping sits between the two.
 */

export const AI_PROVIDER_TYPES = ['llm', 'stt', 'tts'] as const
export type AiProviderType = (typeof AI_PROVIDER_TYPES)[number]

/**
 * Today's vendors. `openai_compatible` is an endpoint the organisation runs or chooses itself, the one vendor with an
 * address of its own; `cloud` is Agenthix Cloud, reached through hq's existing connection to it with no key.
 */
export const AI_PROVIDER_VENDORS = [
  'anthropic', 'openai', 'google', 'openrouter', 'openai_compatible', 'assemblyai', 'inworld', 'cloud',
] as const
export type AiProviderVendor = (typeof AI_PROVIDER_VENDORS)[number]

/**
 * What a provider presents to the vendor: an API key; a person's Claude subscription login (the Claude Code OAuth
 * credentials document, Anthropic's only); or nothing, for Agenthix Cloud, which uses hq's connection.
 */
export const AI_PROVIDER_CREDENTIAL_KINDS = ['api_key', 'subscription', 'none'] as const
export type AiProviderCredentialKind = (typeof AI_PROVIDER_CREDENTIAL_KINDS)[number]

export type AiProviderVendorInfo = {
  /** How a screen names the vendor. */
  label: string
  /** The types every provider of this vendor is. */
  types: readonly AiProviderType[]
  /** What the organisation's provider of this vendor presents. A subscription is a person's, never the organisation's. */
  credential: Exclude<AiProviderCredentialKind, 'subscription'>
  /** True when the provider is stored with its own address (`baseUrl`). */
  hasAddress: boolean
}

export const AI_PROVIDER_VENDOR_INFO: Readonly<Record<AiProviderVendor, AiProviderVendorInfo>> = {
  anthropic: { label: 'Anthropic', types: ['llm'], credential: 'api_key', hasAddress: false },
  openai: { label: 'OpenAI', types: ['llm'], credential: 'api_key', hasAddress: false },
  google: { label: 'Google Gemini', types: ['llm'], credential: 'api_key', hasAddress: false },
  openrouter: { label: 'OpenRouter', types: ['llm'], credential: 'api_key', hasAddress: false },
  openai_compatible: { label: 'Your own OpenAI-compatible endpoint', types: ['llm'], credential: 'api_key', hasAddress: true },
  assemblyai: { label: 'AssemblyAI', types: ['stt'], credential: 'api_key', hasAddress: false },
  inworld: { label: 'Inworld', types: ['tts'], credential: 'api_key', hasAddress: false },
  cloud: { label: 'Agenthix Cloud', types: ['llm', 'stt', 'tts'], credential: 'none', hasAddress: false },
}

export function isAiProviderVendor(v: unknown): v is AiProviderVendor {
  return typeof v === 'string' && (AI_PROVIDER_VENDORS as readonly string[]).includes(v)
}

export function providerTypesOf(vendor: AiProviderVendor): readonly AiProviderType[] {
  return AI_PROVIDER_VENDOR_INFO[vendor].types
}

/**
 * A provider's state (part 1, *When a provider fails*):
 * - `works`: the last call or check succeeded;
 * - `key_refused`: the vendor refuses the key, an `auth` failure confirmed by an immediate check;
 * - `out_of_credit`: the vendor refuses for the account's money, a `quota` failure confirmed by a check;
 * - `unreachable`: three failures in a row, calls or checks, at least a minute apart;
 * - `not_available`, `disconnected`: Agenthix Cloud's only — it does not offer AI to this organisation yet, or the
 *   connection ended.
 *
 * A rate limit is retried and is not a state; Cloud's spending limit belongs to a billing profile, not a provider.
 */
export const AI_PROVIDER_STATES = ['works', 'key_refused', 'out_of_credit', 'unreachable', 'not_available', 'disconnected'] as const
export type AiProviderState = (typeof AI_PROVIDER_STATES)[number]

export function isAiProviderState(v: unknown): v is AiProviderState {
  return typeof v === 'string' && (AI_PROVIDER_STATES as readonly string[]).includes(v)
}

/** Whether new work may be sent to a provider in this state; every other state is skipped as unreachable. */
export function providerStateWorks(state: AiProviderState): boolean {
  return state === 'works'
}

/** The fewest failures in a row, at least `PROVIDER_UNREACHABLE_GAP_MS` apart, that make a provider unreachable. */
export const PROVIDER_UNREACHABLE_AFTER_FAILURES = 3
export const PROVIDER_UNREACHABLE_GAP_MS = 60_000
/** How often every provider is checked, and how often one that is not working is. */
export const PROVIDER_CHECK_INTERVAL_MS = 60 * 60_000
export const PROVIDER_RECHECK_INTERVAL_MS = 5 * 60_000
/** The most of a vendor's message `stateDetail` keeps, once anything that looks like a key is removed. */
export const PROVIDER_STATE_DETAIL_MAX = 500

/**
 * A model choice always names the provider that serves it (*Claude Sonnet 5 · via Anthropic*): a model two providers
 * reach is two choices. `model` is the model as the provider names it (`claude-sonnet-5` at Anthropic,
 * `deepseek/deepseek-v3.2` at OpenRouter); for a voice provider it is the speech model.
 */
export type ModelViaProvider = { providerId: string; model: string }

/** The one line a choice is shown on: `Claude Sonnet 5 · via Anthropic`. */
export function modelViaProviderLabel(modelLabel: string, providerName: string): string {
  return `${modelLabel} · via ${providerName}`
}

/** A speech model with the voice it speaks in, for text to speech; `voice` is absent for speech to text. */
export type VoiceViaProvider = ModelViaProvider & { voice?: string }

/** Who a provider belongs to: the organisation, or one person for their own Claude subscription. */
export type AiProviderOwner = { kind: 'organisation' } | { kind: 'person'; userId: string }

/** A sum of money as it crosses a connection: whole millionths as a safe integer (`parseWireMicros`), and its currency. */
export type MoneyMicros = { amountMicros: number; currency: string }

/** What depends on a provider, as its line shows it, so removing or revoking it says what it touches. */
export type AiProviderUse = {
  /** The organisation's defaults that name it. */
  defaults: Array<'conversation' | 'worker' | 'stt' | 'tts'>
  /** Agents whose own choices name it. */
  agents: Array<{ id: string; name: string }>
}

/**
 * A provider as every read gives it, in hq and to any other part. Never its credential: `keyHint` is the key's
 * last four characters, and null for a provider with no key.
 */
export type AiProviderSummary = {
  id: string
  name: string
  vendor: AiProviderVendor
  types: AiProviderType[]
  credential: AiProviderCredentialKind
  /** For `openai_compatible` only. */
  baseUrl: string | null
  keyHint: string | null
  state: AiProviderState
  stateSince: string
  /** The vendor's own message when not working, trimmed, with anything like a key removed. */
  stateDetail: string | null
  lastCheckedAt: string | null
  lastWorkedAt: string | null
  usedBy: AiProviderUse
  /** This month's cost, one sum per currency, estimated or actual together. */
  costThisMonth: MoneyMicros[]
  createdAt: string
}

/** Every LLM, STT and TTS type is covered by a provider that works: what setup needs before it can finish. */
export function providerTypesCovered(providers: ReadonlyArray<{ vendor: AiProviderVendor; state: AiProviderState }>): Record<AiProviderType, boolean> {
  const covered: Record<AiProviderType, boolean> = { llm: false, stt: false, tts: false }
  for (const p of providers) {
    if (!providerStateWorks(p.state)) continue
    for (const t of providerTypesOf(p.vendor)) covered[t] = true
  }
  return covered
}

