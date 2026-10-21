import type { DashboardAgentRow } from './types'

export interface TopAgentsListProps {
  agents: DashboardAgentRow[]
  onAgentClick?: (agent: DashboardAgentRow) => void
  showSiteContext?: boolean
}

export function TopAgentsList({ agents, onAgentClick, showSiteContext = false }: TopAgentsListProps) {
  if (agents.length === 0) {
    return <p className="text-body text-text-muted px-2 py-3">No agents yet</p>
  }
  return (
    <div className="space-y-2">
      {agents.map(a => (
        <button
          key={`${a.siteSlug ?? ''}:${a.id}`}
          type="button"
          onClick={() => onAgentClick?.(a)}
          className="w-full flex items-center gap-3.5 p-3.5 bg-surface-1 border border-border-subtle rounded-xl text-left hover:bg-surface-hover"
        >
          <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-body font-medium text-text-secondary shrink-0">
            {a.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-body font-semibold text-text-primary truncate">@{a.handle}</div>
            {showSiteContext && (
              <div className="text-micro text-text-muted mt-0.5 truncate">{a.siteName}</div>
            )}
          </div>
          {a.activeSessionCount > 0 ? (
            <span className="bg-accent/15 border border-accent/30 rounded-md px-2 py-1 text-micro text-accent font-medium shrink-0">
              {a.activeSessionCount} active
            </span>
          ) : (
            <span className="bg-surface-2 border border-border-subtle rounded-md px-2 py-1 text-micro text-text-secondary font-medium uppercase tracking-wide shrink-0">
              Idle
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
