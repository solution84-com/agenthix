import { useEffect, useState, type ReactNode } from 'react'
import { SearchField } from '../primitives/FilterControls'
import type { TaskListFilters, TaskListKind, TaskListPageData, TaskListSort } from './taskListTypes'
import {
  FILTER_KINDS, FILTER_LABEL, SORTS, filterChips, filterChoices, sortLabel, withFilter, type FilterKind,
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

const CONTROL = 'inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-small text-text-secondary hover:bg-surface-hover'
const ITEM = 'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover max-sm:min-h-10'

/** A menu under its button; on a phone, a sheet from the foot of the screen. Escape or a click away closes it. */
function PopSheet({ label, onClose, children, align = 'left' }: { label: string; onClose: () => void; children: ReactNode; align?: 'left' | 'right' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-30 max-sm:bg-scrim" onClick={onClose} />
      <div
        role="menu"
        aria-label={label}
        className={`z-40 max-h-[70vh] overflow-y-auto border border-border bg-surface-1 p-1.5 shadow-pop max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl sm:absolute sm:top-full sm:mt-1 sm:w-72 sm:rounded-xl ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`}
      >
        <p className="px-3 pb-1 pt-1.5 text-micro font-medium uppercase tracking-wide text-text-muted sm:hidden">{label}</p>
        {children}
      </div>
    </>
  )
}

function AddFilter({ kind, filters, options, onFilters }: Pick<TasksToolHeaderProps, 'kind' | 'filters' | 'options' | 'onFilters'>) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<FilterKind | null>(null)
  const close = () => { setOpen(false); setPicking(null) }
  const choose = (k: FilterKind, value: string) => { onFilters(withFilter(filters, k, value)); close() }
  return (
    <div className="relative">
      <button type="button" className={CONTROL} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        ＋ Filter
      </button>
      {open && (
        <PopSheet label={picking ? FILTER_LABEL[picking] : 'Filter by'} onClose={close}>
          {picking === null ? FILTER_KINDS[kind].map(k => (
            <button
              key={k} type="button" role="menuitem" className={ITEM}
              onClick={() => (k === 'archived' ? choose(k, 'yes') : setPicking(k))}
            >
              {FILTER_LABEL[k]}
            </button>
          )) : (
            <>
              <button type="button" className={`${ITEM} text-accent`} onClick={() => setPicking(null)}>‹ Filter by</button>
              {filterChoices(picking, options).length === 0 && <p className="px-3 py-2 text-small text-text-muted">None in this list.</p>}
              {filterChoices(picking, options).map(c => (
                <button key={c.value} type="button" role="menuitem" className={ITEM} onClick={() => choose(picking, c.value)}>{c.label}</button>
              ))}
            </>
          )}
        </PopSheet>
      )}
    </div>
  )
}

function SortMenu({ sort, onSort }: Pick<TasksToolHeaderProps, 'sort' | 'onSort'>) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative ml-auto">
      <button type="button" className={CONTROL} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        Sort: {sortLabel(sort)} ▾
      </button>
      {open && (
        <PopSheet label="Sort" align="right" onClose={() => setOpen(false)}>
          {SORTS.map(s => (
            <button
              key={s.sort} type="button" role="menuitemradio" aria-checked={s.sort === sort} className={ITEM}
              onClick={() => { onSort(s.sort); setOpen(false) }}
            >
              <span className="w-3 shrink-0 text-accent">{s.sort === sort ? '✓' : ''}</span>
              <span><span className="block font-medium">{s.label}</span><span className="block text-micro text-text-muted">{s.hint}</span></span>
            </button>
          ))}
        </PopSheet>
      )}
    </div>
  )
}

/** Search, the filters in use as chips with ＋ Filter beside them, and the order (T7 ③ ④). */
export function TasksToolHeader(p: TasksToolHeaderProps) {
  const chips = filterChips(p.filters, p.kind, p.options)
  return (
    <div className="space-y-2 px-4 pt-3">
      <TasksSearch label="Search tasks" value={p.search} onChange={p.onSearch} />
      <div className="flex flex-wrap items-center gap-2">
        {chips.map(chip => (
          <span key={chip.kind} className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-1 py-0.5 pl-2.5 pr-1 text-small text-text-primary">
            {chip.label}
            <button
              type="button" aria-label={`Clear ${chip.label}`}
              className="rounded-full px-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
              onClick={() => p.onFilters(withFilter(p.filters, chip.kind, null))}
            >
              ✕
            </button>
          </span>
        ))}
        <AddFilter kind={p.kind} filters={p.filters} options={p.options} onFilters={p.onFilters} />
        <SortMenu sort={p.sort} onSort={p.onSort} />
      </div>
    </div>
  )
}
