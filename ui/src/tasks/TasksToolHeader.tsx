import { useState } from 'react'
import { Check, ChevronRight, Plus, X } from 'lucide-react'
import { CONTROL_HEIGHT, FOCUS_RING } from '../primitives/controlStyles'
import { SearchField } from '../primitives/FilterControls'
import { MENU_ITEM as ITEM, MenuHeading, OPENS_MENU, PopSheet, SortMenu } from '../primitives/Menus'
import type { TaskListFilters, TaskListKind, TaskListPageData, TaskListSort } from './taskListTypes'
import {
  FILTER_FIELD, FILTER_KINDS, FILTER_LABEL, SORTS, filterChips, filterChoices, withFilter, type FilterKind,
} from './taskListWords'

export interface TasksToolHeaderProps {
  kind: TaskListKind
  search: string
  onSearch: (search: string) => void
  filters: TaskListFilters
  onFilters: (next: TaskListFilters) => void
  options: TaskListPageData['options']
  sort: TaskListSort
  onSort: (sort: TaskListSort) => void
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
  const chosen = (k: FilterKind): unknown => (k === 'archived' ? undefined : filters[FILTER_FIELD[k]])
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
        <PopSheet label={picking ? FILTER_LABEL[picking] : 'Filter by'} onClose={close} align="right">
          {picking === null ? (
            <>
              <MenuHeading label="Filter by" />
              {FILTER_KINDS[kind].map(k => (
                <button
                  key={k} type="button" role="menuitem" className={ITEM}
                  onClick={() => (k === 'archived' ? choose(k, 'yes') : setPicking(k))}
                >
                  <span className="flex-1">{FILTER_LABEL[k]}</span>
                  {k !== 'archived' && <ChevronRight size={14} aria-hidden className="shrink-0 self-center text-text-muted" />}
                </button>
              ))}
            </>
          ) : (
            <>
              <MenuHeading label={FILTER_LABEL[picking]} onBack={() => setPicking(null)} backLabel="Back to Filter by" />
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

/**
 * The list's toolbar (T7 ③ ④), one row: search, the filters in use as chips, ＋ Filter, and the order at the right.
 * Below `sm` it wraps, the search box on a row of its own first.
 */
export function TasksToolHeader(p: TasksToolHeaderProps) {
  const chips = filterChips(p.filters, p.kind, p.options)
  return (
    <div role="toolbar" aria-label="Search, filter and sort" className="flex flex-wrap items-center gap-2 px-4 pt-4">
      <SearchField label="Search tasks" value={p.search} onChange={p.onSearch} prominent className="min-w-[12rem] flex-1 max-sm:basis-full" />
      {chips.map(chip => (
        <span key={chip.kind} className={`${PILL} pl-3 pr-1 text-text-primary`}>
          {chip.label}
          <button
            type="button" aria-label={`Clear ${chip.label}`}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`}
            onClick={() => p.onFilters(withFilter(p.filters, chip.kind, null))}
          >
            <X size={13} aria-hidden />
          </button>
        </span>
      ))}
      <AddFilter kind={p.kind} filters={p.filters} options={p.options} onFilters={p.onFilters} />
      <div className="ml-auto"><SortMenu value={p.sort} choices={SORTS.map(s => ({ value: s.sort, label: s.label, hint: s.hint }))} onChange={p.onSort} /></div>
    </div>
  )
}
