import type { DashboardAgentRow } from './types'

export interface AgentCostListProps {
  agents: DashboardAgentRow[]
  showSiteContext?: boolean
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function AgentCostList({ agents, showSiteContext = false }: AgentCostListProps) {
  if (agents.length === 0) {
    return <p className="text-body text-text-muted px-2 py-3">No runs yet</p>
  }
  const max = Math.max(1, ...agents.map(a => a.tokens))
  return (
    <div className="space-y-2">
      {agents.map(a => (
        <div
          key={`${a.siteSlug ?? ''}:${a.id}`}
          className="p-3.5 bg-surface-1 border border-border-subtle rounded-xl"
        >
          <div className="flex items-baseline gap-3 mb-2.5">
            <span className="flex-1 text-body font-semibold text-text-primary truncate">@{a.handle}</span>
            {showSiteContext && (
              <span className="text-micro text-text-muted px-2 py-0.5 bg-surface-2 rounded font-medium">
                {a.siteName}
              </span>
            )}
            <span className="font-mono text-small text-text-secondary">{formatTokens(a.tokens)}</span>
            <span className="text-body font-medium text-text-primary min-w-[60px] text-right">
              ${a.estimatedCost.toFixed(4)}
            </span>
          </div>
          <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(a.tokens / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
