/**
 * A check per vendor that costs nothing (models from one place, part 1, F3): listing models or reading the account,
 * never a model call. One interface, `VendorChecks`, so the provider store and health use whichever is installed:
 * the real one below, or a fake in tests (`useVendorChecks`). Agenthix Cloud has none here: its state is its answers.
 *
 * Only the vendor's own error message is kept, never a raw body: a custom endpoint's address is the organisation
 * admin's to choose, so what it answers is not echoed back beyond that one message.
 */
import type { AiProviderVendor } from '@agenthix/core'
import { INWORLD_MODELS_URL, inworldLlmAuthorization } from '../shared/inworldLlm'
import type { FailureKind } from './healthRules'
import { inworldFailure } from './inworldErrors'

export type CheckTarget = { vendor: Exclude<AiProviderVendor, 'cloud'>; key: string | null; baseUrl: string | null }
export type CheckResult = { ok: true } | { ok: false; kind: FailureKind; detail: string }
export type VendorChecks = {
  check(target: CheckTarget): Promise<CheckResult>
  /** The model names an OpenAI-compatible endpoint lists (`data[].id`); none when it lists nothing or cannot be reached. */
  listModels(target: CheckTarget): Promise<string[]>
}

const TIMEOUT_MS = 10_000

type Probe = { url: string; headers: Record<string, string> }

/**
 * `llm` is whether Inworld counts as a model provider (its flag): then the probe is the model list (the check also asks
 * the voice list when that fails, `checkInworldBoth`); otherwise it is the voice list.
 */
export function probeFor({ vendor, key, baseUrl }: CheckTarget, llm = false): Probe {
  const k = key ?? ''
  switch (vendor) {
    case 'anthropic': return { url: 'https://api.anthropic.com/v1/models', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } }
    case 'openai': return { url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${k}` } }
    case 'google': return { url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: { 'x-goog-api-key': k } }
    case 'openrouter': return { url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: `Bearer ${k}` } }
    case 'openai_compatible':
      return { url: `${(baseUrl ?? '').replace(/\/+$/, '')}/models`, headers: k ? { Authorization: `Bearer ${k}` } : {} }
    case 'assemblyai': return { url: 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', headers: { Authorization: k } }
    case 'inworld':
      if (llm) return { url: INWORLD_MODELS_URL, headers: { Authorization: inworldLlmAuthorization(k) } }
      return { url: 'https://api.inworld.ai/tts/v1/voices', headers: { Authorization: `Basic ${k}` } }
  }
}

/** The vendor's message out of an error body: `error.message`, `message` or `error`, else nothing. */
export function messageOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const error = b.error
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string
  }
  if (typeof b.message === 'string') return b.message
  if (typeof error === 'string') return error
  return null
}

const QUOTA_WORDS = /quota|credit|billing|balance|insufficient|payment/i

/** What an answer says about the key, from its status and the vendor's message. */
export function classify(vendor: CheckTarget['vendor'], status: number, body: unknown): CheckResult {
  if (vendor === 'inworld' && (status < 200 || status >= 300)) {
    const failure = inworldFailure(status, body)
    if (failure) return failure
  }
  const said = messageOf(body)
  const detail = (fallback: string) => said ?? fallback
  if (status >= 200 && status < 300) {
    // OpenRouter answers its key's limit; one used up is out of credit, though the key itself works.
    const data = vendor === 'openrouter' && body && typeof body === 'object' ? (body as { data?: { limit_remaining?: unknown } }).data : undefined
    if (typeof data?.limit_remaining === 'number' && data.limit_remaining <= 0) return { ok: false, kind: 'quota', detail: 'The key has used its credit limit.' }
    return { ok: true }
  }
  if (status === 402 || (status === 429 && said && QUOTA_WORDS.test(said)) || (status === 400 && said && QUOTA_WORDS.test(said))) {
    return { ok: false, kind: 'quota', detail: detail('Out of credit.') }
  }
  if (status === 401 || status === 403 || (vendor === 'google' && status === 400 && said && /api key/i.test(said))) {
    return { ok: false, kind: 'auth', detail: detail('The key was refused.') }
  }
  if (status === 429) return { ok: false, kind: 'rate-limit', detail: detail('Too many requests just now.') }
  if (status >= 500) return { ok: false, kind: 'unavailable', detail: detail(`It answered with a server error (${status}).`) }
  return { ok: false, kind: 'invalid', detail: detail(`It answered ${status}, not as ${vendor === 'openai_compatible' ? 'an OpenAI-compatible endpoint' : 'expected'}.`) }
}

/** The ids in an OpenAI-style models answer, `{ data: [{ id }] }`; anything else is none. */
export function modelIdsOf(body: unknown): string[] {
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null
  if (!Array.isArray(data)) return []
  return data.flatMap(m => (m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string' && (m as { id: string }).id ? [(m as { id: string }).id] : []))
}

/** A custom endpoint is asked from HQ's machine but used from the Execution Site, so a failure names the likely cause. */
export function unreachableDetail(vendor: CheckTarget['vendor'], timedOut: boolean): string {
  const said = timedOut ? 'It did not answer in time.' : 'It could not be reached.'
  return vendor === 'openai_compatible' ? `${said} ${CUSTOM_ADDRESS_ADVICE}` : said
}

export const CUSTOM_ADDRESS_ADVICE =
  'Check the address from the Execution Site that runs the agents: on a model server on the same machine, localhost is the container itself, so give the machine’s own address or host.docker.internal instead.'

/** Inworld's 429 carries no `Retry-After`, so a limited check waits a little longer each time, then reports the limit. */
export const RATE_LIMIT_BACKOFF_MS: readonly number[] = [1_000, 2_000]

async function checkOnce(target: CheckTarget, llm: boolean): Promise<CheckResult> {
  const { url, headers } = probeFor(target, llm)
  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    return { ok: false, kind: 'unavailable', detail: unreachableDetail(target.vendor, timedOut) }
  }
  const body: unknown = await res.json().catch(() => null)
  return classify(target.vendor, res.status, body)
}

/** Which failure tells the person more: a refused key or no credit over a bad answer, over a limit, over no answer. */
const INFORMATIVE: Partial<Record<FailureKind, number>> = { auth: 4, quota: 4, invalid: 3, 'rate-limit': 2, unavailable: 1 }
const informative = (kind: FailureKind) => INFORMATIVE[kind] ?? 0

/**
 * With Inworld as a model provider too, the provider works when either probe works: a key that serves speech only (or
 * models only) is not a refused key. The model list goes first, since the same key then serves speech; only when it
 * fails is the voice list asked. When both fail, the more informative failure is reported (a refused key over no answer).
 */
async function checkInworldBoth(target: CheckTarget): Promise<CheckResult> {
  const models = await checkOnce(target, true)
  if (models.ok) return models
  const voice = await checkOnce(target, false)
  if (voice.ok) return voice
  return informative(voice.kind) > informative(models.kind) ? voice : models
}

export const realVendorChecks: VendorChecks = {
  async check(target) {
    const run = () => (target.vendor === 'inworld' ? checkInworldBoth(target) : checkOnce(target, false))
    let result = await run()
    if (target.vendor !== 'inworld') return result
    for (const wait of RATE_LIMIT_BACKOFF_MS) {
      if (result.ok || result.kind !== 'rate-limit') break
      await new Promise(resolve => setTimeout(resolve, wait))
      result = await run()
    }
    return result
  },

  async listModels(target) {
    if (target.vendor !== 'openai_compatible') return []
    const { url, headers } = probeFor(target)
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
      if (!res.ok) return []
      return modelIdsOf(await res.json().catch(() => null))
    } catch {
      return []
    }
  },
}

let installed: VendorChecks = realVendorChecks

export function vendorChecks(): VendorChecks {
  return installed
}

/** Tests install a fake; `null` puts the real one back. */
export function useVendorChecks(checks: VendorChecks | null): void {
  installed = checks ?? realVendorChecks
}
