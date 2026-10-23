/**
 * The usage report (models from one place, part 5, *How each source reports usage*): the site's model relay reads the
 * vendor's own usage from each answer as it passes, without changing it (Anthropic's `message_start` and
 * `message_delta`, the OpenAI and OpenRouter final usage chunk, Gemini's `usageMetadata`), and reports each upstream
 * call to hq with the call id it made for it. The same report carries the upstream status and the kind of failure, so
 * hq's provider health sees an agent's failing calls as it sees its own.
 *
 * Delivered at least once, over the site's own way of asking hq (HTTPS with its machine credential, as a capability
 * renewal; hq serves no requests on the control channel): the site keeps each report on disk until hq acknowledges
 * it, posts them in batches of at most `USAGE_REPORT_BATCH_MAX` to `HQ_USAGE_REPORT_PATH` (`UsageReportBatch`), and
 * sends again what was not acknowledged. hq writes a ledger row per call id once, so a report that arrives twice
 * counts once, and answers the call ids it has kept (`UsageReportAcknowledged`), those it already had included. A
 * retry of a call by the relay reuses its call id.
 *
 * A container on a person's own Claude subscription is not relayed: its usage is the run's own report.
 */
import { isCallId, type CallUsage } from '../billing/ledger.js'

export const HQ_USAGE_REPORT_PATH = '/api/v1/usage/report'
export const USAGE_REPORT_BATCH_MAX = 200

/**
 * The kind of failure, as hq's model adapter names it, so one rule moves a provider's state whichever side saw it:
 * `auth` (the key refused), `quota` (the account's money), `rate-limit` (retried; not a state), `unavailable` (the
 * vendor did not answer or answered a server error), `invalid` (a fault in the request), `cap_reached` (Agenthix
 * Cloud's spending limit, a billing profile's), `other`.
 */
export const UPSTREAM_ERROR_KINDS = ['auth', 'quota', 'rate-limit', 'unavailable', 'invalid', 'cap_reached', 'other'] as const
export type UpstreamErrorKind = (typeof UPSTREAM_ERROR_KINDS)[number]

export type UsageReport = {
  /** Made by the relay for this upstream call, and sent to Agenthix Cloud with it. */
  callId: string
  runId: string
  providerId: string
  /** The model as the request named it. */
  model: string
  /** When the answer ended, ISO. */
  at: string
  /** The vendor's own usage; null when the answer carried none, which hq writes unpriced and logs. */
  usage: Pick<CallUsage, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'> | null
  /** The upstream HTTP status; 0 when no answer came. */
  upstreamStatus: number
  /** Set when the call failed. */
  errorKind?: UpstreamErrorKind
}

/** The body of a `POST HQ_USAGE_REPORT_PATH`. */
export type UsageReportBatch = { reports: UsageReport[] }

/** hq's answer: every call id it now holds a row for. One it refused as malformed is left out and logged by hq. */
export type UsageReportAcknowledged = { acknowledged: string[] }

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@~-]{0,199}$/

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)

function usageOf(v: unknown): UsageReport['usage'] | undefined {
  if (v === null) return null
  const u = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!u) return undefined
  const out = {
    inputTokens: count(u.inputTokens), outputTokens: count(u.outputTokens),
    cacheReadTokens: count(u.cacheReadTokens ?? 0), cacheWriteTokens: count(u.cacheWriteTokens ?? 0),
  }
  return Object.values(out).every(n => n !== null) ? (out as NonNullable<UsageReport['usage']>) : undefined
}

/** hq's side: one report off the wire, or null when it is not one. */
export function parseUsageReport(v: unknown): UsageReport | null {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!r || !isCallId(r.callId)) return null
  if (typeof r.runId !== 'string' || !ID.test(r.runId) || typeof r.providerId !== 'string' || !ID.test(r.providerId)) return null
  if (typeof r.model !== 'string' || !MODEL.test(r.model)) return null
  if (typeof r.at !== 'string' || r.at.length > 40 || Number.isNaN(Date.parse(r.at))) return null
  const usage = usageOf(r.usage)
  const status = count(r.upstreamStatus)
  if (usage === undefined || status === null || status > 599) return null
  if (r.errorKind !== undefined && !(UPSTREAM_ERROR_KINDS as readonly unknown[]).includes(r.errorKind)) return null
  return {
    callId: r.callId, runId: r.runId, providerId: r.providerId, model: r.model, at: new Date(r.at).toISOString(), usage,
    upstreamStatus: status, ...(r.errorKind !== undefined ? { errorKind: r.errorKind as UpstreamErrorKind } : {}),
  }
}
