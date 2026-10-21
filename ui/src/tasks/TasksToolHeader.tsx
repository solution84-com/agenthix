import { Plus } from 'lucide-react'
import { FilterSelect, SearchField } from '../primitives/FilterControls'
import type { TaskListFilter } from './taskGroups'
import { TASK_BUTTON } from './TasksToolParts'

export interface TasksToolHeaderProps {
  /** Absent where there is no backlog to open (Your tasks). */
  backlogCount?: number
  doneCount: number
  filter: TaskListFilter
  onFilter: (next: TaskListFilter) => void
  /** What the filters offer; a filter with no options is not shown. */
  agents?: { id: string; name: string }[]
  boards?: { id: string; name: string }[]
  projects?: { key: string; name: string }[]
  showPriorityFilter?: boolean
  onOpenBacklog?: () => void
  onOpenDone: () => void
  /** Absent where a task cannot be added from here (Your tasks). */
  onNewTask?: () => void
  searchLabel?: string
}

export function TasksSearch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <SearchField label={label} value={value} onChange={onChange} className="flex-1" />
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-surface-2 px-1.5 text-micro text-text-secondary">{n}</span>
}

function TaskFilter({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <FilterSelect label={label} value={value} onChange={onChange}>
      <option value="">{label}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </FilterSelect>
  )
}

/**
 * Backlog and Done with their counts, always in reach, then search; the filters
 * join search only when the tool is wide (every screen reviewed spec §3).
 */
export function TasksToolHeader(p: TasksToolHeaderProps) {
  const set = (patch: Partial<TaskListFilter>) => p.onFilter({ ...p.filter, ...patch })
  return (
    <div className="@container space-y-2 px-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {p.onOpenBacklog && (
          <button type="button" className={TASK_BUTTON} onClick={p.onOpenBacklog}>Backlog <Count n={p.backlogCount ?? 0} /></button>
        )}
        <button type="button" className={TASK_BUTTON} onClick={p.onOpenDone}>Done <Count n={p.doneCount} /></button>
        {p.onNewTask && (
          <button type="button" className={`${TASK_BUTTON} ml-auto`} onClick={p.onNewTask}>
            <Plus size={13} aria-hidden /> New task
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TasksSearch label={p.searchLabel ?? 'Search tasks'} value={p.filter.search} onChange={search => set({ search })} />
        <div className="hidden items-center gap-2 @2xl:flex">
          {p.agents && p.agents.length > 0 && (
            <TaskFilter label="Agent" value={p.filter.agentId} onChange={agentId => set({ agentId })} options={p.agents.map(a => ({ value: a.id, label: a.name }))} />
          )}
          {p.boards && p.boards.length > 0 && (
            <TaskFilter label="Board" value={p.filter.boardId} onChange={boardId => set({ boardId })} options={p.boards.map(b => ({ value: b.id, label: b.name }))} />
          )}
          {p.projects && p.projects.length > 0 && (
            <TaskFilter label="Project" value={p.filter.projectKey} onChange={projectKey => set({ projectKey })} options={p.projects.map(x => ({ value: x.key, label: x.name }))} />
          )}
          {p.showPriorityFilter !== false && (
            <TaskFilter
              label="Priority" value={p.filter.priority} onChange={priority => set({ priority })}
              options={[{ value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]}
            />
          )}
        </div>
      </div>
    </div>
  )
}
