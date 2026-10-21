import type { DashboardActivityRow } from './types'

export interface ActivityFeedProps {
  activity: DashboardActivityRow[]
  showSiteContext?: boolean
}

function relativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export function ActivityFeed({ activity, showSiteContext = false }: ActivityFeedProps) {
  if (activity.length === 0) {
    return <p className="text-body text-text-muted py-3">No recent activity</p>
  }
  return (
    <div>
      {activity.map(row => (
        <div
          key={`${row.siteSlug ?? ''}:${row.id}`}
          className="flex items-start gap-3.5 py-3 border-b border-border-subtle last:border-b-0"
        >
          <div className="text-micro text-text-muted w-16 shrink-0 font-mono pt-0.5">
            {relativeTime(row.timestamp)}
          </div>
          <div className="flex-1 text-small text-text-primary">
            {row.summary}
            {showSiteContext && <span className="block text-micro text-text-muted mt-0.5">{row.siteName}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
