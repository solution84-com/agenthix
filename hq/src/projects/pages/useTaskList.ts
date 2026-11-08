import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_COLUMNS, DEFAULT_SORT, SORTS, parseColumns, todayText,
  type TaskListCard, type TaskListColumn, type TaskListFilters, type TaskListKind, type TaskListSort,
} from '@agenthix/ui/tasks'

const PAGE = 50
const SEARCH_WAIT_MS = 250
const sortKey = (list: string) => `task-list-sort:${list}`
const columnsKey = (list: string) => `task-list-columns:${list}`

function read<T>(key: string, parse: (raw: string) => T | null, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key)
    return (stored !== null ? parse(stored) : null) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* private window: the choice lasts this visit */ }
}

function jsonColumns(raw: string): TaskListColumn[] | null {
  try { return parseColumns(JSON.parse(raw)) } catch { return null }
}

/**
 * What a task list is asked for, and how a person changes it (T3). The sort and the columns (Fields ▾) stay on this
 * list, in this browser. `chosen` puts the scorecard somewhere else, such as the address.
 */
export function useTaskList(
  list: string,
  kind: TaskListKind,
  initialCard: TaskListCard | null = null,
  chosen?: [TaskListCard | null, (card: TaskListCard | null) => void],
) {
  const own = useState<TaskListCard | null>(initialCard)
  const [card, setCard] = chosen ?? own
  const [filters, setFilters] = useState<TaskListFilters>({})
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('')
  const [sort, setSortState] = useState<TaskListSort>(() => read(
    sortKey(list), raw => SORTS[kind].find(s => s.sort === raw)?.sort ?? null, DEFAULT_SORT[kind],
  ))
  const [columns, setColumnsState] = useState<TaskListColumn[]>(() => read(columnsKey(list), jsonColumns, [...DEFAULT_COLUMNS]))
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    const wait = setTimeout(() => { setSearched(search.trim()); setLimit(PAGE) }, SEARCH_WAIT_MS)
    return () => clearTimeout(wait)
  }, [search])

  const setSort = useCallback((next: TaskListSort) => {
    setSortState(next)
    setLimit(PAGE)
    write(sortKey(list), next)
  }, [list])

  const setColumns = useCallback((next: TaskListColumn[]) => {
    setColumnsState(next)
    write(columnsKey(list), JSON.stringify(next))
  }, [list])

  return {
    card,
    chooseCard: (next: TaskListCard | null) => { setCard(next); setLimit(PAGE) },
    filters,
    setFilters: (next: TaskListFilters) => { setFilters(next); setLimit(PAGE) },
    search,
    setSearch,
    sort,
    setSort,
    columns,
    setColumns,
    /** A search, a filter or a scorecard other than All is on. */
    narrowed: card !== null || Object.keys(filters).length > 0 || !!searched,
    clear: () => { setSearch(''); setFilters({}); setCard(null); setLimit(PAGE) },
    showMore: () => setLimit(l => l + PAGE),
    args: { ...filters, card: card ?? undefined, sort, limit, search: searched || undefined, today: todayText(new Date()) },
  }
}
