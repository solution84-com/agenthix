import type { DashboardSnapshot } from '@agenthix/core'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K tokens`
  return `${n} tokens`
}

export interface FinancialOverviewProps {
  financial: DashboardSnapshot['financial']
  isLive?: boolean
}

export function FinancialOverview({ financial, isLive = false }: FinancialOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card label="Total AI Cost" value={`$${financial.estimatedCost.toFixed(4)}`} sub={
        isLive
          ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1.5" />{formatTokens(financial.totalTokens)}</>
          : formatTokens(financial.totalTokens)
      } subAccent={isLive} />
      <Card label="Revenue" value="$0.00" sub="Coming soon" muted />
      <Card label="Expenses" value="$0.00" sub="Coming soon" muted />
      <Card label="Net Margin" value="$0.00" sub="Coming soon" muted />
    </div>
  )
}

function Card({ label, value, sub, muted, subAccent }: {
  label: string; value: string; sub: React.ReactNode; muted?: boolean; subAccent?: boolean
}) {
  return (
    <div className="bg-surface-1 border border-border-subtle rounded-xl p-4">
      <div className="text-micro font-medium uppercase tracking-wide text-text-muted mb-2.5">{label}</div>
      <div className={`text-h1 font-semibold leading-none -tracking-[0.02em] ${muted ? 'text-text-muted' : 'text-text-primary'}`}>
        {value}
      </div>
      <div className={`text-micro mt-2 ${subAccent ? 'text-accent/80 flex items-center' : muted ? 'text-text-muted italic' : 'text-text-secondary'}`}>
        {sub}
      </div>
    </div>
  )
}
