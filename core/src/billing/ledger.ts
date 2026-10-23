/**
 * The ledger (models from one place, part 5): every model, speech-to-text and text-to-speech call is one row in hq,
 * costed to a billing profile. The rules it is built on:
 *
 * 1. Money is whole millionths of a currency unit (`bigint` in code, a safe integer on the wire), with its ISO 4217
 *    currency; never a floating-point number.
 * 2. Append-only: a correction is a new row pointing at its call.
 * 3. One call id, made on the organisation's side (by hq for its own calls, by the site relay for an agent's) and
 *    shared with Agenthix Cloud, used end to end. A retry reuses it, so a call is counted once.
 * 4. Each row names its price (`PriceRef`).
 * 5. A billing profile is archived, never deleted, and its id never reused.
 * 6. Rows are in UTC; a month is cut in the organisation's time zone.
 * 7. A refusal for money (a provider's cap) is its own kind, with its own message.
 *
 * The values are spelled as hq stores them (its `UsageEntry` enums).
 */

/** `CALL` is the call with its usage; `ACTUAL` is Agenthix Cloud's figure for an earlier call; `CORRECTION` a fix. */
export const USAGE_ENTRY_KINDS = ['CALL', 'ACTUAL', 'CORRECTION'] as const
export type UsageEntryKind = (typeof USAGE_ENTRY_KINDS)[number]

/** What a call was for. A helper is a worker's own helper; `voice_sample` is the voice sample phrase. */
export const USAGE_PURPOSES = ['conversation', 'worker', 'helper', 'title', 'summary', 'stt', 'tts', 'voice_sample'] as const
export type UsagePurpose = (typeof USAGE_PURPOSES)[number]

/**
 * Where a cost comes from:
 * - `ACTUAL`: measured by the provider that bills it (Agenthix Cloud);
 * - `ESTIMATED`: hq's price list times the usage, on the organisation's own keys (and on Cloud while `usageBilling`
 *   is off, from Cloud's catalogue);
 * - `INCLUDED`: a person's own Claude subscription, with no per-call price;
 * - `UNPRICED`: a model with no known price;
 * - `AWAITING_ACTUAL`: a call through Cloud whose actual cost has not been reported yet.
 */
export const COST_BASES = ['ACTUAL', 'ESTIMATED', 'INCLUDED', 'UNPRICED', 'AWAITING_ACTUAL'] as const
export type CostBasis = (typeof COST_BASES)[number]

/** What a call used. Each is 0 when the call did not use it. */
export type CallUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Speech to text: milliseconds of audio. */
  audioMs: number
  /** Text to speech: characters sent. */
  characters: number
}

export const NO_USAGE: Readonly<CallUsage> = {
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, audioMs: 0, characters: 0,
}

/** The currency of hq's own price lists. */
export const PRICE_LIST_CURRENCY = 'USD'
export const MICROS_PER_UNIT = 1_000_000

/**
 * Which price a row used (rule 4): hq's own list at a version (`hq:<version>`), Agenthix Cloud's catalogue at a
 * version (`cloud-catalogue:<version>`), or Cloud's reported figure (`cloud-actual`).
 */
export type PriceRef = `hq:${string}` | `cloud-catalogue:${string}` | 'cloud-actual'

export const hqPriceRef = (version: string): PriceRef => `hq:${version}`
export const cloudCataloguePriceRef = (version: string): PriceRef => `cloud-catalogue:${version}`
export const CLOUD_ACTUAL_PRICE_REF: PriceRef = 'cloud-actual'

const PRICE_REF = /^(hq|cloud-catalogue):[A-Za-z0-9._-]{1,64}$/

export function parsePriceRef(v: unknown): PriceRef | null {
  if (v === CLOUD_ACTUAL_PRICE_REF) return CLOUD_ACTUAL_PRICE_REF
  return typeof v === 'string' && PRICE_REF.test(v) ? (v as PriceRef) : null
}

/** A call id: made by hq or the site relay, shared with Cloud as `X-Agenthix-Call-Id`. A uuid in practice. */
const CALL_ID = /^[A-Za-z0-9_-]{8,64}$/

export function isCallId(v: unknown): v is string {
  return typeof v === 'string' && CALL_ID.test(v)
}

/**
 * An amount of millionths as it crosses a connection: a JSON number that is a whole, safe integer (up to about nine
 * thousand million units, far beyond any one sum hq shows), negative only for a correction. Code that adds amounts
 * works in `bigint`.
 */
export function parseWireMicros(v: unknown, allowNegative = false): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && (allowNegative || v >= 0) ? v : null
}

/** An ISO 4217 code: three capital letters. */
export function isCurrencyCode(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z]{3}$/.test(v)
}

/** Dollars (or any unit) as whole millionths, rounded to the nearest. For converting a price list once, never a sum. */
export function unitsToMicros(units: number): bigint {
  return BigInt(Math.round(units * MICROS_PER_UNIT))
}

/** Rounds `numerator / denominator` half away from zero; both whole, the denominator positive. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const half = denominator / 2n
  return numerator >= 0n ? (numerator + half) / denominator : -((-numerator + half) / denominator)
}

/** A model's prices in millionths per million tokens. */
export type TokenPricesMicros = {
  inputMicros: bigint
  outputMicros: bigint
  cacheReadMicros: bigint
  cacheWriteMicros: bigint
}

const PER_MILLION = 1_000_000n

/** The cost of a model call, in millionths: each kind of token at its price per million, summed, then rounded once. */
export function tokenCostMicros(prices: TokenPricesMicros, usage: Pick<CallUsage, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): bigint {
  const sum =
    BigInt(usage.inputTokens) * prices.inputMicros +
    BigInt(usage.outputTokens) * prices.outputMicros +
    BigInt(usage.cacheReadTokens) * prices.cacheReadMicros +
    BigInt(usage.cacheWriteTokens) * prices.cacheWriteMicros
  return divideRounded(sum, PER_MILLION)
}

const MS_PER_HOUR = 3_600_000n

/** Speech to text, priced per hour of audio. */
export function audioCostMicros(perHourMicros: bigint, audioMs: number): bigint {
  return divideRounded(BigInt(audioMs) * perHourMicros, MS_PER_HOUR)
}

/** Text to speech, priced per million characters. */
export function characterCostMicros(perMillionCharsMicros: bigint, characters: number): bigint {
  return divideRounded(BigInt(characters) * perMillionCharsMicros, PER_MILLION)
}
