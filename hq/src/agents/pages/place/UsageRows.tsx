import type { UsageTotals } from '../../usageTotals'
import { costLabel, usageSummary } from './usageView'

function Row({ label, totals }: { label: string; totals: UsageTotals }) {
  return (
    <div data-testid="usage-row" className="border-t border-border-subtle py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-medium text-text-primary">{label}</span>
        <span className="text-body text-text-primary">{costLabel(totals)}</span>
      </div>
      <div className="mt-0.5 text-small text-text-muted">{usageSummary(totals).join(' · ') || 'Nothing run this month'}</div>
      {totals.unpricedTokens > 0 && (
        <div className="mt-0.5 text-small text-text-muted">Some runs used a model with no price; their cost is not included.</div>
      )}
    </div>
  )
}

/** Usage (spec §3): on an agent's place two rows, the person's own and the organisation's; the settings page shows the organisation's alone. */
export function UsageRows({ yours, organisation }: { yours?: UsageTotals; organisation: UsageTotals }) {
  return (
    <div>
      {yours && <Row label="Your usage" totals={yours} />}
      <Row label="Organisation usage" totals={organisation} />
      <p className="mt-2 text-small text-text-muted">This month. Cost is an estimate from the tokens at list price.</p>
    </div>
  )
}
