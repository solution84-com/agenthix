import type { ReactNode } from 'react'

export interface DashboardLayoutProps {
  /** Top stat cards row (call StatsCards inside). */
  stats: ReactNode
  /** Wide left-column slot: typically RecentProjectsList + TaskOverviewBar + ActivityFeed in vertical cards. */
  leftColumn: ReactNode
  /** Narrow right-column slot: typically AgentCostList + FinancialOverview + TopAgentsList. */
  rightColumn: ReactNode
}

export function DashboardLayout({ stats, leftColumn, rightColumn }: DashboardLayoutProps) {
  return (
    <div className="px-4 lg:px-8 py-7">
      {stats}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-7">
        <div className="space-y-5">{leftColumn}</div>
        <div className="space-y-5">{rightColumn}</div>
      </div>
    </div>
  )
}

export interface DashboardCardProps {
  title: ReactNode
  meta?: ReactNode
  children: ReactNode
}

export function DashboardCard({ title, meta, children }: DashboardCardProps) {
  return (
    <div className="bg-surface-1 border border-border-subtle rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-h3 font-semibold uppercase tracking-wide text-text-secondary flex items-center gap-2.5">
          {title}
        </h4>
        {meta && <span className="text-micro text-text-muted flex items-center gap-1.5">{meta}</span>}
      </div>
      {children}
    </div>
  )
}
