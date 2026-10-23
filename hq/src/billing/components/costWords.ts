/** The words and figures the billing screens use (part 5): money from millionths, and what each basis means. */
import type { CostBasis } from '@agenthix/core'

export const BASIS_ORDER: CostBasis[] = ['ACTUAL', 'ESTIMATED', 'AWAITING_ACTUAL', 'INCLUDED', 'UNPRICED']

export const BASIS_WORDS: Record<CostBasis, { label: string; means: string }> = {
  ACTUAL: { label: 'Actual', means: "Agenthix Cloud's own figure for the call. It matches Agenthix Cloud's bill." },
  ESTIMATED: { label: 'Estimated', means: "Your own providers' keys, worked out from list prices. Your provider's bill may differ." },
  AWAITING_ACTUAL: { label: 'Awaiting Agenthix Cloud', means: 'Calls through Agenthix Cloud whose actual cost it has not reported yet.' },
  INCLUDED: { label: 'Included in subscriptions', means: "Runs on a person's own Claude subscription. They cost nothing per call." },
  UNPRICED: { label: 'Unpriced', means: 'Calls to a model with no known price. They are counted, but have no cost here.' },
}

/** Whole millionths of a currency unit as money: `$41.20`, `$0.0012`, never rounded to nothing. */
export function moneyOf(micros: number, currency: string | null): string {
  const units = micros / 1_000_000
  const digits = Math.abs(units) >= 1 || units === 0 ? 2 : 4
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency ?? 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(units)
  } catch {
    return `${units.toFixed(digits)} ${currency ?? ''}`.trim()
  }
}

export function callsWords(calls: number): string {
  return `${calls.toLocaleString('en')} ${calls === 1 ? 'call' : 'calls'}`
}

/** `2026-10` as `October 2026`. */
export function monthWords(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
