/**
 * Agenthix Cloud as a provider of models and voice (models from one place, part 6): the calls hq and Cloud build to,
 * and the checks each side runs on what the other sends. No key is ever handed to
 * the organisation: every call carries a short-lived access token hq signed for with its own key (./connection.ts),
 * and the site relay asks hq for that token for a container's calls.
 *
 * - **C1, the token:** `POST /connect/token` as today, with `scope=ai` (`CLOUD_AI_SCOPE`). It answers an access token
 *   of an hour at most, kept in memory only. `invalid_scope` means Cloud does not offer AI to this hq (X1).
 * - **C2, the catalogue:** `GET /ai/catalogue` with the bearer token and `If-None-Match: <version>`, at each check-in.
 *   It answers `CloudAiCatalogue`, or 304 when unchanged. Pickers offer its models *via Agenthix Cloud*.
 * - **C3, the gateway:** `/ai/v1/anthropic/…` and `/ai/v1/openai/…`, each vendor's own API unchanged, with the token as
 *   `Authorization: Bearer` or `x-api-key`. With `usageBilling` on, each call also carries `CLOUD_CALL_ID_HEADER` and
 *   `CLOUD_BILLING_PROFILE_HEADER`.
 * - **C4 and C5, voice:** `POST /ai/voice/stt-token` and `/ai/voice/tts-token` answer `CloudVoiceToken`, good for one
 *   listening session or one spoken reply; the browser, or hq, then talks to the speech service itself.
 * - **C6, actual costs:** `GET /ai/usage?after=<cursor>` (with `usageBilling`) answers `CloudUsagePage`, at most
 *   `CLOUD_USAGE_PAGE_MAX` entries. hq reads it at each check-in and when the usage report opens, at most once a
 *   minute, and keeps the cursor with Cloud's organisation id. An entry for a call hq does not know is logged and kept
 *   apart, never dropped. Cloud answers an entry as long as it keeps its own billing record of the call.
 * - **C7, billing profiles:** `PUT /billing/profiles/:id` with `CloudBillingProfilePut` (with `usageBilling`), when a
 *   profile is made, renamed or archived, and for all of them after reconnecting; answered 204. Cloud learns a
 *   profile's id and name, and nothing else of the organisation.
 * - **C8, the key rollover:** `POST /connect/keys` (./aiKeys.ts).
 *
 * The refusals (`CloudAiRefusal`, read by `readCloudAiRefusal`): X1 `not_available` (403, or `invalid_scope` at C1);
 * X2 `cap_reached` (402, inside the vendor's own error shape through the gateway); X3 `disconnected`
 * (`invalid_client`, as today); X4 `model_not_offered` (404, after which hq refreshes the catalogue); X5, 429 and
 * 426, as today (./answers.ts, ./version.ts).
 *
 * Money is whole millionths of the catalogue's currency, as JSON safe integers. Every JSON answer is camelCase; the
 * form-encoded `/connect/*` endpoints keep RFC 6749's names.
 */
import { isCallId, isCurrencyCode, parseWireMicros } from '../billing/ledger.js'

export const CLOUD_AI_SCOPE = 'ai'
export const CLOUD_AI_CATALOGUE_PATH = '/ai/catalogue'
export const CLOUD_AI_GATEWAY_PATHS = { anthropic: '/ai/v1/anthropic', openai: '/ai/v1/openai' } as const
export const CLOUD_AI_STT_TOKEN_PATH = '/ai/voice/stt-token'
export const CLOUD_AI_TTS_TOKEN_PATH = '/ai/voice/tts-token'
export const CLOUD_AI_USAGE_PATH = '/ai/usage'
/** `PUT <path>/<billing profile id>`. */
export const CLOUD_BILLING_PROFILES_PATH = '/billing/profiles'

/** The call id hq or the site relay made for a call through the gateway, the same one its ledger row carries. */
export const CLOUD_CALL_ID_HEADER = 'X-Call-Id'
/** The billing profile a call through the gateway is costed to. */
export const CLOUD_BILLING_PROFILE_HEADER = 'X-Billing-Profile-Id'

/** The vendor APIs the gateway speaks. */
export const CLOUD_AI_APIS = ['anthropic', 'openai'] as const
export type CloudAiApi = (typeof CLOUD_AI_APIS)[number]

export const CLOUD_USAGE_PAGE_MAX = 500
/** The most hq reads of the catalogue's lists; past it, the rest is left out. */
export const CLOUD_CATALOGUE_MAX_ENTRIES = 5000
/** The least time between two reads of actual costs. */
export const CLOUD_USAGE_MIN_INTERVAL_MS = 60_000

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@~-]{0,199}$/
const OPAQUE_ID = /^[A-Za-z0-9._~-]{1,200}$/
const TOKEN = /^[A-Za-z0-9._~+/=-]{16,4096}$/
const VERSION = /^[A-Za-z0-9._:-]{1,100}$/
const CURSOR = /^[A-Za-z0-9._~+/=-]{1,500}$/

export type CloudTokenPricesMicros = { inputMicros: number; outputMicros: number; cacheReadMicros: number; cacheWriteMicros: number }

/** A model Cloud carries. Prices are per million tokens. */
export type CloudAiModel = {
  /** Who made it (`anthropic`, `deepseek`), which lists match on. */
  maker: string
  /** The model as the gateway names it. */
  model: string
  name: string
  apis: CloudAiApi[]
  contextTokens: number
  price: CloudTokenPricesMicros
}

export type CloudSttModel = { model: string; perHourMicros: number }
export type CloudTtsVoice = { id: string; name: string; language: string }
export type CloudTtsModel = { model: string; perMillionCharsMicros: number; voices: CloudTtsVoice[] }

/** C2's answer. `version` is what hq sends back in `If-None-Match`, and what a ledger row's `cloud-catalogue:` names. */
export type CloudAiCatalogue = {
  version: string
  currency: string
  models: CloudAiModel[]
  stt: CloudSttModel[]
  tts: CloudTtsModel[]
}

/** C4's body. `callId` and `billingProfileId` are sent only with `usageBilling` on. */
export type CloudSttTokenRequest = { model: string; callId?: string; billingProfileId?: string }
/** C5's body. */
export type CloudTtsTokenRequest = { model: string; voice: string; callId?: string; billingProfileId?: string }

/** C4's and C5's answer: a single-use token, where to use it, and when it lapses (ISO). */
export type CloudVoiceToken = { token: string; url: string; expiresAt: string }

/** One actual cost, for a call hq made. */
export type CloudUsageEntry = { callId: string; at: string; amountMicros: number; currency: string }

/** C6's answer. `next` is the cursor for the page after; null when there is nothing more for now. */
export type CloudUsagePage = { entries: CloudUsageEntry[]; next: string | null }

/** C7's body. */
export type CloudBillingProfilePut = { name: string; archived: boolean }

export const CLOUD_AI_REFUSAL_CODES = ['not_available', 'cap_reached', 'disconnected', 'model_not_offered'] as const
export type CloudAiRefusalCode = (typeof CLOUD_AI_REFUSAL_CODES)[number]

/** What X2 is set for: the whole organisation, or one billing profile. */
export type CloudCapScope = 'organisation' | 'billing_profile'

export type CloudAiRefusal =
  | { error: 'not_available' }
  | { error: 'cap_reached'; scope: CloudCapScope; resetsAt: string }
  | { error: 'disconnected' }
  | { error: 'model_not_offered' }

/** The statuses Cloud sends each refusal with; `disconnected` is today's 401 `invalid_client`. */
export const CLOUD_AI_REFUSAL_STATUS = { not_available: 403, cap_reached: 402, disconnected: 401, model_not_offered: 404 } as const

/** Through the gateway a refusal sits inside the vendor's own error shape, in this field. */
export const CLOUD_GATEWAY_ERROR_FIELD = 'cloud_error'

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : null
}

function time(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
}

const model = (v: unknown): string | null => (typeof v === 'string' && MODEL.test(v) ? v : null)
const opaqueId = (v: unknown): string | null => (typeof v === 'string' && OPAQUE_ID.test(v) ? v : null)

function list<T>(v: unknown, each: (x: unknown) => T | null, max: number): T[] {
  return Array.isArray(v) ? v.slice(0, max).map(each).filter((x): x is T => x !== null) : []
}

function prices(v: unknown): CloudTokenPricesMicros | null {
  const p = record(v)
  if (!p) return null
  const out = {
    inputMicros: parseWireMicros(p.inputMicros), outputMicros: parseWireMicros(p.outputMicros),
    cacheReadMicros: parseWireMicros(p.cacheReadMicros ?? 0), cacheWriteMicros: parseWireMicros(p.cacheWriteMicros ?? 0),
  }
  return Object.values(out).every(n => n !== null) ? (out as CloudTokenPricesMicros) : null
}

function aiModel(v: unknown): CloudAiModel | null {
  const m = record(v)
  if (!m) return null
  const apis = list(m.apis, a => ((CLOUD_AI_APIS as readonly unknown[]).includes(a) ? (a as CloudAiApi) : null), CLOUD_AI_APIS.length)
  const out = {
    maker: opaqueId(m.maker), model: model(m.model), name: text(m.name, 200), price: prices(m.price),
    contextTokens: parseWireMicros(m.contextTokens),
  }
  if (!out.maker || !out.model || !out.name || !out.price || out.contextTokens === null || apis.length === 0) return null
  return { ...(out as Omit<CloudAiModel, 'apis'>), apis: [...new Set(apis)] }
}

function sttModel(v: unknown): CloudSttModel | null {
  const m = record(v)
  const out = { model: model(m?.model), perHourMicros: parseWireMicros(m?.perHourMicros) }
  return out.model && out.perHourMicros !== null ? (out as CloudSttModel) : null
}

function ttsVoice(v: unknown): CloudTtsVoice | null {
  const t = record(v)
  const out = { id: opaqueId(t?.id), name: text(t?.name, 200), language: text(t?.language, 35) }
  return out.id && out.name && out.language ? (out as CloudTtsVoice) : null
}

function ttsModel(v: unknown): CloudTtsModel | null {
  const m = record(v)
  const out = { model: model(m?.model), perMillionCharsMicros: parseWireMicros(m?.perMillionCharsMicros) }
  if (!out.model || out.perMillionCharsMicros === null) return null
  return { ...(out as Omit<CloudTtsModel, 'voices'>), voices: list(m?.voices, ttsVoice, CLOUD_CATALOGUE_MAX_ENTRIES) }
}

/** hq's side: C2's answer. Entries not in their shape are dropped; null when the catalogue itself is not one. */
export function parseCloudAiCatalogue(v: unknown): CloudAiCatalogue | null {
  const c = record(v)
  if (!c || typeof c.version !== 'string' || !VERSION.test(c.version) || !isCurrencyCode(c.currency)) return null
  if (!Array.isArray(c.models) || !Array.isArray(c.stt) || !Array.isArray(c.tts)) return null
  return {
    version: c.version,
    currency: c.currency,
    models: list(c.models, aiModel, CLOUD_CATALOGUE_MAX_ENTRIES),
    stt: list(c.stt, sttModel, CLOUD_CATALOGUE_MAX_ENTRIES),
    tts: list(c.tts, ttsModel, CLOUD_CATALOGUE_MAX_ENTRIES),
  }
}

function billingRefs(r: Record<string, unknown>): { callId?: string; billingProfileId?: string } | null {
  if (r.callId !== undefined && !isCallId(r.callId)) return null
  if (r.billingProfileId !== undefined && !opaqueId(r.billingProfileId)) return null
  return {
    ...(r.callId !== undefined ? { callId: r.callId as string } : {}),
    ...(r.billingProfileId !== undefined ? { billingProfileId: r.billingProfileId as string } : {}),
  }
}

/** Cloud's side: C4's body. */
export function parseCloudSttTokenRequest(v: unknown): CloudSttTokenRequest | null {
  const r = record(v)
  const m = model(r?.model)
  const refs = r && billingRefs(r)
  return m && refs ? { model: m, ...refs } : null
}

/** Cloud's side: C5's body. */
export function parseCloudTtsTokenRequest(v: unknown): CloudTtsTokenRequest | null {
  const r = record(v)
  const m = model(r?.model)
  const voice = opaqueId(r?.voice)
  const refs = r && billingRefs(r)
  return m && voice && refs ? { model: m, voice, ...refs } : null
}

const Url = (globalThis as unknown as { URL: new (input: string) => { protocol: string; username: string; password: string; toString(): string } }).URL

/** hq's side: C4's and C5's answer. The address must be https (or wss) with no credentials in it. */
export function parseCloudVoiceToken(v: unknown): CloudVoiceToken | null {
  const t = record(v)
  if (!t || typeof t.token !== 'string' || !TOKEN.test(t.token) || typeof t.url !== 'string' || t.url.length > 2048) return null
  const expiresAt = time(t.expiresAt)
  if (!expiresAt) return null
  try {
    const url = new Url(t.url)
    if ((url.protocol !== 'https:' && url.protocol !== 'wss:') || url.username || url.password) return null
    return { token: t.token, url: url.toString(), expiresAt }
  } catch {
    return null
  }
}

function usageEntry(v: unknown): CloudUsageEntry | null {
  const e = record(v)
  if (!e || !isCallId(e.callId) || !isCurrencyCode(e.currency)) return null
  const at = time(e.at)
  const amountMicros = parseWireMicros(e.amountMicros)
  return at && amountMicros !== null ? { callId: e.callId, at, amountMicros, currency: e.currency } : null
}

/**
 * hq's side: C6's answer. An entry not in its shape is dropped and counted in `dropped`, for hq to log; null when the
 * page itself is not one.
 */
export function parseCloudUsagePage(v: unknown): (CloudUsagePage & { dropped: number }) | null {
  const p = record(v)
  if (!p || !Array.isArray(p.entries) || p.entries.length > CLOUD_USAGE_PAGE_MAX) return null
  if (p.next !== null && !isCloudUsageCursor(p.next)) return null
  const entries = list(p.entries, usageEntry, CLOUD_USAGE_PAGE_MAX)
  return { entries, next: p.next as string | null, dropped: p.entries.length - entries.length }
}

/** Either side: the `after` cursor of C6, opaque to hq. */
export function isCloudUsageCursor(v: unknown): v is string {
  return typeof v === 'string' && CURSOR.test(v)
}

/** Cloud's side: C7's path id and body. */
export function parseCloudBillingProfilePut(id: unknown, body: unknown): ({ id: string } & CloudBillingProfilePut) | null {
  const b = record(body)
  const profileId = opaqueId(id)
  const name = text(b?.name, 200)
  if (!profileId || !name || typeof b?.archived !== 'boolean') return null
  return { id: profileId, name, archived: b.archived }
}

function refusalOf(v: unknown): CloudAiRefusal | null {
  const r = record(v)
  switch (r?.error) {
    case 'not_available': return { error: 'not_available' }
    case 'model_not_offered': return { error: 'model_not_offered' }
    case 'cap_reached': {
      const resetsAt = time(r.resetsAt)
      const scope = r.scope === 'organisation' || r.scope === 'billing_profile' ? r.scope : null
      return resetsAt && scope ? { error: 'cap_reached', scope, resetsAt } : null
    }
    default: return null
  }
}

/**
 * hq's side, and the site relay's: what a refused AI call comes to, from its status and body, whether the body is
 * Cloud's own (`{error, …}`) or the vendor's error shape from the gateway carrying `cloud_error` at its top or inside
 * its `error`. `invalid_client` is X3. Null when it is none of Cloud's refusals: a vendor's own error, or 429 and 426,
 * which are read as today.
 */
export function readCloudAiRefusal(status: number, body: unknown): CloudAiRefusal | null {
  const b = record(body)
  if (status === CLOUD_AI_REFUSAL_STATUS.disconnected && b?.error === 'invalid_client') return { error: 'disconnected' }
  const own = refusalOf(b)
  const nested = refusalOf(b?.[CLOUD_GATEWAY_ERROR_FIELD]) ?? refusalOf(record(b?.error)?.[CLOUD_GATEWAY_ERROR_FIELD])
  const refusal = own ?? nested
  if (!refusal || CLOUD_AI_REFUSAL_STATUS[refusal.error] !== status) return null
  return refusal
}

/** Cloud's side: whether a token request asks for the AI scope. */
export function asksForCloudAiScope(form: Record<string, unknown>): boolean {
  return typeof form.scope === 'string' && form.scope.split(' ').includes(CLOUD_AI_SCOPE)
}
