import type { AgentNow } from '../../agentNow'
import type { UsageTotals } from '../../usageTotals'
import { costLabel } from './usageView'

/** The Now row's count: "1 needs you · 1 running", or nothing when it is idle. */
export function nowCount(now: Pick<AgentNow, 'needsYouCount' | 'runningCount'>): { count?: string; tone?: 'needs' | 'live' } {
  const parts: string[] = []
  if (now.needsYouCount > 0) parts.push(`${now.needsYouCount} needs you`)
  if (now.runningCount > 0) parts.push(`${now.runningCount} running`)
  if (parts.length === 0) return {}
  return { count: parts.join(' · '), tone: now.needsYouCount > 0 ? 'needs' : 'live' }
}

/** The Usage row's count: "yours ~$4.20 · organisation ~$61.80"; nothing until the read has answered. */
export function usageCount(usage: { yours: UsageTotals; organisation: UsageTotals } | undefined): string | undefined {
  if (!usage) return undefined
  if (usage.organisation.runCount === 0) return 'none yet'
  return `yours ${costLabel(usage.yours)} · organisation ${costLabel(usage.organisation)}`
}
