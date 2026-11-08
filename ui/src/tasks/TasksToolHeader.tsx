import { useState } from 'react'
import { Check, ChevronRight, Plus, X } from 'lucide-react'
import { CONTROL_HEIGHT, FOCUS_RING } from '../primitives/controlStyles'
import { SearchField } from '../primitives/FilterControls'
import { MENU_ITEM as ITEM, MenuHeading, OPENS_MENU, PopSheet, SortMenu } from '../primitives/Menus'
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

// One height and outline for every control in the row; a filter chip and ＋ Filter are one pill, ＋ Filter dashed.
const PILL = `${CONTROL_HEIGHT} inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-1 text-small ${FOCUS_RING}`

function AddFilter({ kind, filters, options, onFilters }: Pick<TasksToolHeaderProps, 'kind' | 'filters' | 'options' | 'onFilters'>) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<FilterKind | null>(null)
  const close = () => { setOpen(false); setPicking(null) }
  const choose = (k: FilterKind, value: string) => { onFilters(withFilter(filters, k, value)); close() }
  const chosen = (k: FilterKind): unknown => (k === 'archived' ? undefined : filters[filterFieldOf(k)])
  return (
    <div className="relative">
      <button
        type="button" className={`${PILL} border-dashed px-3 text-text-secondary hover:bg-surface-hover ${OPENS_MENU}`}
        aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}
      >
        <Plus size={14} aria-hidden />
        Filter
      </button>
      {open && (
        <PopSheet label={picking ? filterLabel(picking, options) : 'Filter by'} onClose={close} align="right">
          {picking === null ? (
            <>
              <MenuHeading label="Filter by" />
              {filterKindsOf(kind, options).map(k => (
                <button
                  key={k} type="button" role="menuitem" className={ITEM}
                  onClick={() => (k === 'archived' ? choose(k, 'yes') : setPicking(k))}
                >
                  <span className="flex-1">{filterLabel(k, options)}</span>
                  {k !== 'archived' && <ChevronRight size={14} aria-hidden className="shrink-0 self-center text-text-muted" />}
                </button>
              ))}
            </>
          ) : (
            <>
              <MenuHeading label={filterLabel(picking, options)} onBack={() => setPicking(null)} backLabel="Back to Filter by" />
              {filterChoices(picking, options).length === 0 && <p className="px-3 py-2 text-small text-text-muted">None in this list.</p>}
              {filterChoices(picking, options).map(c => (
                <button key={c.value} type="button" role="menuitem" className={ITEM} onClick={() => choose(picking, c.value)}>
                  <span className="flex w-4 shrink-0 justify-center self-center text-accent">{chosen(picking) === c.value && <Check size={14} aria-hidden />}</span>
                  <span className="flex-1">{c.label}</span>
                </button>
              ))}
            </>
          )}
        </PopSheet>
      )}
    </div>
  )
}

function Chip({ chip, onClear }: { chip: FilterChip; onClear: () => void }) {
  return (
    <span className={`${PILL} pl-3 pr-1 text-text-primary`}>
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
      <div role="toolbar" aria-label="Search, filter and sort" className="flex flex-wrap items-center gap-2 px-4 pt-4 max-sm:flex-nowrap">
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
        <div aria-label="Filters in use" role="group" className="flex flex-wrap gap-2 px-4 pt-2 sm:hidden">
          {chips.map(chip => <Chip key={chip.kind} chip={chip} onClear={() => clear(chip)} />)}
        </div>
      )}
    </>
  )
}
