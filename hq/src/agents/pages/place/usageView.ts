import { formatTokens, formatEnergy } from '../../../shared/utils/aiMetrics'
import type { UsageTotals } from '../../usageTotals'

/** Cost is an estimate from the tokens at list price, so it is always written with a ~ (spec §3, Usage). */
export function costLabel(totals: UsageTotals): string {
  if (totals.runCount === 0) return 'No usage yet'
  return `~$${totals.costUsd.toFixed(2)}`
}

export function usageSummary(totals: UsageTotals): string[] {
  if (totals.runCount === 0) return []
  const lines = [`${totals.runCount} ${totals.runCount === 1 ? 'run' : 'runs'}`, `${formatTokens(totals.totalTokens)} tokens`]
  if (totals.energyKwh > 0) lines.push(formatEnergy(totals.energyKwh))
  return lines
}

/** The month a usage period starts in, as the ISO time the read takes; the first of this month, local. */
export function monthStart(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}
