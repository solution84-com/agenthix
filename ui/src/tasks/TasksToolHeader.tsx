import { X } from 'lucide-react'
import { FOCUS_RING } from '../primitives/controlStyles'
import { AddFilterMenu, FILTER_PILL, type AddFilterKind } from '../primitives/AddFilterMenu'
import { SearchField } from '../primitives/FilterControls'
import { SortMenu } from '../primitives/Menus'
import type { TaskListColumn, TaskListFilters, TaskListKind, TaskListPageData, TaskListSort } from './taskListTypes'
import {
  SORTS, filterChips, filterChoices, filterFieldOf, filterKindsOf, filterLabel, withFilter, type FilterChip, type FilterKind,
} from './taskListWords'
import { TasksFieldsMenu } from './TasksFieldsMenu'

export interface TasksToolHeaderProps {
  kind: TaskListKind
  search: string
  onSearch: (search: string) => void
  filters: TaskListFilters
  onFilters: (next: TaskListFilters) => void
  options: TaskListPageData['options']
  sort: TaskListSort
  onSort: (sort: TaskListSort) => void
  /** The lines' columns (Fields ▾); without them the list has no Fields menu. */
  columns?: readonly TaskListColumn[]
  onColumns?: (next: TaskListColumn[]) => void
}

export function TasksSearch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <SearchField label={label} value={value} onChange={onChange} className="flex-1" />
}

function AddFilter({ kind, filters, options, onFilters }: Pick<TasksToolHeaderProps, 'kind' | 'filters' | 'options' | 'onFilters'>) {
  const kinds: AddFilterKind[] = filterKindsOf(kind, options).map(k => (k === 'archived'
    ? { key: k, label: filterLabel(k, options), direct: 'yes' }
    : { key: k, label: filterLabel(k, options), choices: filterChoices(k, options) }))
  const chosen = (k: string): string | null => {
    if (k === 'archived') return null
    const v: unknown = filters[filterFieldOf(k as Exclude<FilterKind, 'archived'>)]
    return typeof v === 'string' ? v : null
  }
  return <AddFilterMenu kinds={kinds} chosen={chosen} onChoose={(k, value) => onFilters(withFilter(filters, k as FilterKind, value))} />
}

function Chip({ chip, onClear }: { chip: FilterChip; onClear: () => void }) {
  return (
    <span className={`${FILTER_PILL} pl-3 pr-1 text-text-primary`}>
      {chip.label}
      <button
        type="button" aria-label={`Clear ${chip.label}`}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`}
        onClick={onClear}
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  )
}

/**
 * The list's toolbar (T3): search, the filters in use as chips, ＋ Filter, and at the right Fields ▾ and Sort. On a
 * phone the view's controls keep one line (search, ＋ Filter, Sort) and the chips in use take the line under it.
 */
export function TasksToolHeader(p: TasksToolHeaderProps) {
  const chips = filterChips(p.filters, p.kind, p.options)
  const clear = (chip: FilterChip) => p.onFilters(withFilter(p.filters, chip.kind, null))
  return (
    <>
      <div role="toolbar" aria-label="Search, filter and sort" className="flex flex-wrap items-center gap-2 px-6 pt-4 max-lg:px-3 max-sm:flex-nowrap">
        <SearchField label="Search tasks" value={p.search} onChange={p.onSearch} className="min-w-[12rem] flex-1 max-sm:min-w-0" />
        {chips.map(chip => <span key={chip.kind} className="contents max-sm:hidden"><Chip chip={chip} onClear={() => clear(chip)} /></span>)}
        <AddFilter kind={p.kind} filters={p.filters} options={p.options} onFilters={p.onFilters} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {p.columns && p.onColumns && (
            <div className="max-sm:hidden"><TasksFieldsMenu columns={p.columns} fields={p.options.fields} onColumns={p.onColumns} /></div>
          )}
          <SortMenu value={p.sort} choices={SORTS[p.kind].map(s => ({ value: s.sort, label: s.label, hint: s.hint }))} onChange={p.onSort} />
        </div>
      </div>
      {chips.length > 0 && (
        <div aria-label="Filters in use" role="group" className="flex flex-wrap gap-2 px-6 pt-2 max-lg:px-3 sm:hidden">
          {chips.map(chip => <Chip key={chip.kind} chip={chip} onClear={() => clear(chip)} />)}
        </div>
      )}
    </>
  )
}
