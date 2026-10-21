/**
 * aiMetrics
 * =========
 * Shared helpers for displaying and estimating AI/LLM usage metrics:
 * token counts, cost (with prompt caching), energy, and carbon footprint.
 *
 * Caching is a first-class concept. Providers that don't support caching
 * (e.g. OpenAI) set cacheReadPerMTok / cacheWritePerMTok to 0, and callers
 * simply omit cacheReadTokens / cacheWriteTokens from TokenUsage.
 *
 * Environmental estimates based on published research:
 *   ~0.002 kWh per 1,000 tokens, 0.4 kg CO₂/kWh (US grid avg).
 */

// ── Environmental constants ───────────────────────────────────────────────────

export const KWH_PER_TOKEN  = 0.000002
export const CO2_KG_PER_KWH = 0.4

// ── Pricing registry ──────────────────────────────────────────────────────────

// One table for both apps and both runtimes, built in core from the pinned model catalogue.
import { MODEL_PRICING, type ModelPricing } from '@agenthix/core'
export { MODEL_PRICING }
export type { ModelPricing }

// ── Token usage shape ─────────────────────────────────────────────────────────

// Defined in @agenthix/core (core/src/protocol/runtimeData.ts) now that site's
// run.get/run.list serve it over the wire — re-exported here so existing
// imports of `TokenUsage` from this module keep working.
import type { TokenUsage } from '@agenthix/core'
export type { TokenUsage }

// ── Cost calculation ──────────────────────────────────────────────────────────

/**
 * Returns the cost in USD for a token usage record.
 * Returns 0 if the model is not in the pricing registry.
 */
export function calculateCost(usage: TokenUsage, model: string | null | undefined): number {
  const p = model ? MODEL_PRICING[model] : undefined
  if (!p) return 0
  return (
    usage.inputTokens               * p.inputPerMTok      / 1_000_000 +
    usage.outputTokens              * p.outputPerMTok     / 1_000_000 +
    (usage.cacheReadTokens  ?? 0)   * p.cacheReadPerMTok  / 1_000_000 +
    (usage.cacheWriteTokens ?? 0)   * p.cacheWritePerMTok / 1_000_000
  )
}

/**
 * Returns a formatted cost string.
 * Shows '—' when the model is unknown or not provided.
 */
export function formatCost(usage: TokenUsage, model: string | null | undefined): string {
  if (!model || !MODEL_PRICING[model]) return '—'
  const cost = calculateCost(usage, model)
  if (cost < 0.001) return '<$0.001'
  return `~$${cost.toFixed(3)}`
}

// ── Environmental formatting ──────────────────────────────────────────────────

export function tokensToCo2Grams(tokens: number): number {
  return tokens * KWH_PER_TOKEN * CO2_KG_PER_KWH * 1000
}

export function tokensToKwh(tokens: number): number {
  return tokens * KWH_PER_TOKEN
}

export function formatCo2(grams: number): string {
  if (grams < 1)    return `${(grams * 1000).toFixed(1)} mg`
  if (grams < 1000) return `${grams.toFixed(1)} g`
  return `${(grams / 1000).toFixed(2)} kg`
}

export function formatEnergy(kwh: number): string {
  if (kwh < 0.001) return `${(kwh * 1_000_000).toFixed(1)} mWh`
  if (kwh < 1)     return `${(kwh * 1000).toFixed(1)} Wh`
  return `${kwh.toFixed(3)} kWh`
}

// ── Token count formatting ────────────────────────────────────────────────────

/**
 * Short human-readable token count:
 *   < 1 000      → "847"
 *   ≥ 1 000      → "1.2k"
 *   ≥ 1 000 000  → "1.2M"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
