/**
 * A check per vendor that costs nothing (models from one place, part 1, F3): listing models or reading the account,
 * never a model call. One interface, `VendorChecks`, so the provider store and health use whichever is installed:
 * the real one below, or a fake in tests (`useVendorChecks`). Agenthix Cloud has none here: its state is its answers.
 *
 * Only the vendor's own error message is kept, never a raw body: a custom endpoint's address is the organisation
 * admin's to choose, so what it answers is not echoed back beyond that one message.
 */
import type { AiProviderVendor } from '@agenthix/core'
import type { FailureKind } from './healthRules'

export type CheckTarget = { vendor: Exclude<AiProviderVendor, 'cloud'>; key: string | null; baseUrl: string | null }
export type CheckResult = { ok: true } | { ok: false; kind: FailureKind; detail: string }
export type VendorChecks = { check(target: CheckTarget): Promise<CheckResult> }

const TIMEOUT_MS = 10_000

type Probe = { url: string; headers: Record<string, string> }

export function probeFor({ vendor, key, baseUrl }: CheckTarget): Probe {
  const k = key ?? ''
  switch (vendor) {
    case 'anthropic': return { url: 'https://api.anthropic.com/v1/models', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } }
    case 'openai': return { url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${k}` } }
    case 'google': return { url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: { 'x-goog-api-key': k } }
    case 'openrouter': return { url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: `Bearer ${k}` } }
    case 'openai_compatible':
      return { url: `${(baseUrl ?? '').replace(/\/+$/, '')}/models`, headers: k ? { Authorization: `Bearer ${k}` } : {} }
    case 'assemblyai': return { url: 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', headers: { Authorization: k } }
    case 'inworld': return { url: 'https://api.inworld.ai/tts/v1/voices', headers: { Authorization: `Basic ${k}` } }
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

export const realVendorChecks: VendorChecks = {
  async check(target) {
    const { url, headers } = probeFor(target)
    let res: Response
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError'
      return { ok: false, kind: 'unavailable', detail: timedOut ? 'It did not answer in time.' : 'It could not be reached.' }
    }
    const body: unknown = await res.json().catch(() => null)
    return classify(target.vendor, res.status, body)
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
