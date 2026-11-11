import { Flame } from 'lucide-react'
import type { DashboardProjectRow } from './types'
import { CARD_CLICKABLE } from '../primitives/controlStyles'

export interface RecentProjectsListProps {
  projects: DashboardProjectRow[]
  onProjectClick?: (project: DashboardProjectRow) => void
  showSiteContext?: boolean      // true in HQ all-sites mode
}

export function RecentProjectsList({ projects, onProjectClick, showSiteContext = false }: RecentProjectsListProps) {
  if (projects.length === 0) {
    return <p className="text-body text-text-muted px-2 py-3">No projects yet</p>
  }
  return (
    <div className="space-y-2">
      {projects.map(p => (
        <button
          key={`${p.siteSlug ?? ''}:${p.id}`}
          type="button"
          onClick={() => onProjectClick?.(p)}
          className={`w-full flex items-center gap-3.5 p-3.5 bg-card border rounded-xl text-left ${CARD_CLICKABLE}`}
        >
          <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
            <Flame size={16} className="text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-body font-medium text-text-primary truncate">{p.name}</div>
            <div className="text-micro text-text-muted mt-0.5">
              {showSiteContext && <span>{p.siteName} · </span>}
              {p.description ?? 'No description'}
            </div>
          </div>
          <div className="text-micro text-text-secondary shrink-0 text-right">
            <strong className="text-text-primary">{p.doneTaskCount}/{p.taskCount}</strong> tasks · {p.boardCount} boards
          </div>
        </button>
      ))}
    </div>
  )
}
