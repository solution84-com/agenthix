import type { ReactNode } from 'react'
import { Archive, Search, X, ChevronRight } from 'lucide-react'
import { SHOWN_RUN_STATES, runStateLabel } from './runState'

export interface TaskFilterState {
  agentId: string
  priority: string
  runState: string
}

export const EMPTY_TASK_FILTER: TaskFilterState = {
  agentId: '',
  priority: '',
  runState: '',
}

export function isFilterActive(f: TaskFilterState): boolean {
  return f.agentId !== '' || f.priority !== '' || f.runState !== ''
}

const PRIORITY_OPTIONS = ['HIGH', 'MEDIUM', 'LOW']

const SELECT_CLASS =
  'h-7 px-2 pr-6 rounded-lg bg-surface-2 border border-border text-micro text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent/50 appearance-none cursor-pointer hover:bg-surface-hover transition-colors'

export interface TaskFilterAgent {
  id: string
  name: string
}

export interface TaskFilterBarProps {
  /** Options for the agent dropdown. If omitted, the agent filter is hidden. */
  agents?: TaskFilterAgent[]
  filters: TaskFilterState
  onFiltersChange: (f: TaskFilterState) => void

  /** Search box appears only when onSearchChange is provided. */
  search?: string
  onSearchChange?: (v: string) => void

  /** Archived toggle appears only when onToggleArchived is provided. */
  showArchived?: boolean
  onToggleArchived?: () => void

  /** Slot at the right edge for extra controls (e.g. New Task button). */
  actions?: ReactNode
}

export function TaskFilterBar({
  agents,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  showArchived,
  onToggleArchived,
  actions,
}: TaskFilterBarProps) {
  const active = isFilterActive(filters)

  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-border-subtle shrink-0 flex-wrap">

      {/* Agent */}
      {agents && (
        <div className="relative">
          <select
            value={filters.agentId}
            onChange={e => onFiltersChange({ ...filters, agentId: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <ChevronRight size={10} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-text-muted pointer-events-none" />
        </div>
      )}

      {/* Priority */}
      <div className="relative">
        <select
          value={filters.priority}
          onChange={e => onFiltersChange({ ...filters, priority: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </select>
        <ChevronRight size={10} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-text-muted pointer-events-none" />
      </div>

      {/* Run state */}
      <div className="relative">
        <select
          value={filters.runState}
          onChange={e => onFiltersChange({ ...filters, runState: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="">Any run</option>
          {SHOWN_RUN_STATES.map(s => (
            <option key={s} value={s}>{runStateLabel(s)}</option>
          ))}
        </select>
        <ChevronRight size={10} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-text-muted pointer-events-none" />
      </div>

      {/* Clear */}
      {active && (
        <button
          onClick={() => onFiltersChange(EMPTY_TASK_FILTER)}
          className="flex items-center gap-1 h-7 px-2 rounded-lg bg-surface-2 hover:bg-surface-hover text-micro text-text-muted hover:text-text-secondary transition-colors border border-border"
        >
          <X size={10} />
          Clear filters
        </button>
      )}

      {/* Archived toggle */}
      {onToggleArchived && (
        <button
          onClick={onToggleArchived}
          className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-micro font-medium transition-colors border ${
            showArchived
              ? 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'
              : 'bg-surface-2 text-text-muted border-border hover:bg-surface-hover hover:text-text-secondary'
          }`}
          title={showArchived ? 'Hide archived tasks' : 'Show archived tasks'}
        >
          <Archive size={11} />
          {showArchived ? 'Archived on' : 'Archived'}
        </button>
      )}

      {/* Search */}
      {onSearchChange !== undefined && (
        <div className="relative ml-auto">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/70 pointer-events-none" />
          <input
            type="text"
            value={search ?? ''}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search tasks…"
            className="h-7 bg-surface-2 border border-border rounded-lg pl-7 pr-3 text-micro text-text-secondary placeholder:text-text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors w-44"
          />
        </div>
      )}

      {actions}
    </div>
  )
}

export function applyTaskFilters<T extends {
  assignedAgent?: { id: string } | null
  priority?: string
  runState?: string
}>(tasks: T[], filters: TaskFilterState): T[] {
  return tasks.filter(t => {
    if (filters.agentId && t.assignedAgent?.id !== filters.agentId) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.runState && t.runState !== filters.runState) return false
    return true
  })
}
