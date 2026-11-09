/**
 * Inworld's list of language models (adr-0183), read defensively: its API is an early version (`v1alpha`), so a field
 * that is missing or of another shape is ignored or defaulted, and an entry that cannot be read is skipped, never fatal.
 * Pure: hq fetches the list and keeps it; this reads it and prices from it.
 *
 * An entry gives `provider` (the host), `model` (Inworld-hosted ones carry a `models/` prefix), `modelCreator` and
 * per-token prices in dollars. A model's id as hq stores it is exactly `provider/model`, the form a call takes.
 */
import { hqPriceRef, unitsToMicros, type PriceRef, type TokenPricesMicros } from '../billing/ledger.js'
import { sameModelKey } from './modelIdentity.js'
import { COST_BAND_MAX_RANKS, MODEL_PRICE_TABLE } from './openCodeModels.generated.js'

/** Dollars per token, as the list gives them. A cache price is null where the list gives none. */
export type InworldTokenPrices = { prompt: number; completion: number; cacheRead: number | null; cacheWrite: number | null }

export type InworldModel = {
  /** `provider/model` exactly as listed. */
  id: string
  /** The maker as the list names it (`Anthropic`, `Z AI`); null when the entry gives none. */
  creator: string | null
  /** Null when the list gives no usable price: the cost is then unknown, never zero. */
  prices: InworldTokenPrices | null
  contextLength: number | null
  vision: boolean
}

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
/** More than this many dollars per token is not a price anyone charges: unknown, so the conversion to micros cannot overflow. */
const MAX_PRICE_PER_TOKEN = 1
/** More entries than this are not read; Inworld's list holds a few dozen. */
export const MAX_INWORLD_MODELS = 5000
const price = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_PRICE_PER_TOKEN ? v : null)

function pricesOf(raw: unknown): InworldTokenPrices | null {
  const p = record(raw)
  const prompt = price(p?.promptToken)
  const completion = price(p?.completionToken)
  if (prompt === null || completion === null) return null
  return { prompt, completion, cacheRead: price(p?.promptCacheReadToken), cacheWrite: price(p?.promptCacheWriteToken) }
}

/** What an agent can use: supported, text out, and function calling. Image generation, safety and embedding models are not. */
function usable(entry: Record<string, unknown>, spec: Record<string, unknown> | null): boolean {
  if (entry.isSupported === false) return false
  const out = spec?.outputModalities
  if (Array.isArray(out) && !out.includes('text')) return false
  return record(spec?.capabilities)?.functionCalling === true
}

function modelOf(raw: unknown): InworldModel | null {
  const entry = record(raw)
  if (!entry || typeof entry.model !== 'string' || typeof entry.provider !== 'string') return null
  const model = entry.model.trim()
  const provider = entry.provider.trim()
  if (!model || !provider) return null
  const spec = record(entry.spec)
  if (!usable(entry, spec)) return null
  const input = spec?.inputModalities
  const context = spec?.contextLength
  return {
    id: `${provider}/${model}`,
    creator: typeof entry.modelCreator === 'string' && entry.modelCreator.trim() ? entry.modelCreator.trim() : null,
    prices: pricesOf(entry.pricing),
    contextLength: typeof context === 'number' && Number.isFinite(context) && context > 0 ? context : null,
    vision: Array.isArray(input) && input.includes('image'),
  }
}

const totalPrice = (m: InworldModel) => (m.prices ? m.prices.prompt + m.prices.completion : null)

/** Whether `next` is the better host of the same model: priced beats unpriced, and a lower price beats a higher; a tie keeps the first. */
function cheaper(next: InworldModel, held: InworldModel): boolean {
  const a = totalPrice(next)
  const b = totalPrice(held)
  return a !== null && (b === null || a < b)
}

/**
 * The models an agent can use, from the list's answer (`{ models: [...] }`); none for any other shape. Ids are listed
 * once, and so is a model several hosts serve (`groq/openai/gpt-oss-120b` and `deepinfra/openai/gpt-oss-120b`): the
 * host with the lower price is kept, in the place the model first appeared.
 */
export function parseInworldModels(body: unknown): InworldModel[] {
  const list = record(body)?.models
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const byModel = new Map<string, number>()
  const out: InworldModel[] = []
  for (const raw of list.slice(0, MAX_INWORLD_MODELS)) {
    const m = modelOf(raw)
    if (!m || seen.has(m.id)) continue
    seen.add(m.id)
    const key = sameModelKey('inworld', m.id, m.creator)
    const at = byModel.get(key)
    if (at === undefined) { byModel.set(key, out.length); out.push(m) } else if (cheaper(m, out[at])) out[at] = m
  }
  return out
}

/**
 * The model's prices in millionths of a dollar per million tokens (a token price times a million, then converted once).
 * A cache price the list does not give is the prompt price: a cached token is never free by omission. Null when the
 * model has no price, so its calls are unpriced, not free.
 */
export function inworldPricesMicros(model: Pick<InworldModel, 'prices'>): TokenPricesMicros | null {
  const p = model.prices
  if (!p) return null
  const perMillion = (perToken: number) => unitsToMicros(perToken * 1_000_000)
  return {
    inputMicros: perMillion(p.prompt),
    outputMicros: perMillion(p.completion),
    cacheReadMicros: perMillion(p.cacheRead ?? p.prompt),
    cacheWriteMicros: perMillion(p.cacheWrite ?? p.prompt),
  }
}

/** Which prices a row used: a hash of every price in the list, so `hq:inworld-<hash>` names exactly the list it read. */
export function inworldPriceRef(models: readonly InworldModel[]): PriceRef {
  let hash = 5381
  const text = models.map(m => `${m.id}|${JSON.stringify(m.prices)}`).sort().join('\n')
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return hqPriceRef(`inworld-${hash.toString(16).padStart(8, '0')}`)
}

/** The cut between a cost band and the next, in dollars per million tokens (input plus output): the generator's. */
const BAND_MAX_PRICE = { low: 8, mid: 25 }

let cataloguePrices: number[] | null = null
function catalogueDistinctPrices(): number[] {
  cataloguePrices ??= [...new Set(Object.values(MODEL_PRICE_TABLE).map(([input, output]) => input + output))].filter(p => p > 0).sort((a, b) => a - b)
  return cataloguePrices
}

/**
 * A rank on the pinned catalogue's scale ("dearer than", 0 free, null unpriced), so a model via Inworld sits in the same
 * cost band as the same price anywhere: the number of distinct catalogue prices at or below this one, held inside the
 * band its price falls in.
 */
export function inworldCostRank(model: Pick<InworldModel, 'prices'>): number | null {
  const p = model.prices
  if (!p) return null
  const total = (p.prompt + p.completion) * 1_000_000
  if (total <= 0) return 0
  const below = catalogueDistinctPrices().filter(c => c <= total).length
  if (total <= BAND_MAX_PRICE.low) return Math.min(Math.max(below, 1), COST_BAND_MAX_RANKS.low)
  if (total <= BAND_MAX_PRICE.mid) return Math.min(Math.max(below, COST_BAND_MAX_RANKS.low + 1), COST_BAND_MAX_RANKS.mid)
  return Math.max(below, COST_BAND_MAX_RANKS.mid + 1)
}

/** Words that keep their own case in a label; any other word is capitalised. */
const WORD_CASE: Record<string, string> = {
  gpt: 'GPT', glm: 'GLM', oss: 'OSS', llm: 'LLM', moe: 'MoE', vl: 'VL', deepseek: 'DeepSeek', minimax: 'MiniMax', nvidia: 'NVIDIA', xai: 'xAI',
}

/**
 * A label from the id, since the list has none: `anthropic/claude-sonnet-5-5` reads `Claude Sonnet 5.5`. A maker that
 * the id names as its own segment (`groq/openai/gpt-oss-120b`) is left out: the name carries it, and the picker groups by maker.
 */
export function inworldLabel(id: string): string {
  const free = id.endsWith(':free')
  const parts = id.replace(/:free$/, '').replace(/^models\//, '').split('/').filter(part => part !== 'models').slice(1)
  const name = (parts.length > 1 ? parts.slice(1) : parts).join(' ') || id
  const words: string[] = []
  for (const token of name.split(/[-\s]+/).filter(Boolean)) {
    const last = words[words.length - 1]
    if (/^\d{1,2}$/.test(token) && last !== undefined && /^\d{1,2}(\.\d{1,2})*$/.test(last)) words[words.length - 1] = `${last}.${token}`
    else words.push(WORD_CASE[token.toLowerCase()] ?? (/^\d/.test(token) ? token : token[0].toUpperCase() + token.slice(1)))
  }
  return `${words.join(' ')}${free ? ' (free)' : ''}`
}
