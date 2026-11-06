import { useCallback, useEffect, useState } from 'react'
import { SORTS, type TaskListCard, type TaskListFilters, type TaskListSort } from '@agenthix/ui/tasks'

const PAGE = 50
const SEARCH_WAIT_MS = 250
const sortKey = (list: string) => `task-list-sort:${list}`

function readSort(list: string): TaskListSort {
  try {
    const stored = window.localStorage.getItem(sortKey(list))
    return SORTS.find(s => s.sort === stored)?.sort ?? 'importance'
  } catch {
    return 'importance'
  }
}

/**
 * What a task list is asked for, and how a person changes it (T7). The sort stays on this list, in this browser.
 * `chosen` puts the scorecard somewhere else, such as the address.
 */
export function useTaskList(
  list: string,
  initialCard: TaskListCard | null = null,
  chosen?: [TaskListCard | null, (card: TaskListCard | null) => void],
) {
  const own = useState<TaskListCard | null>(initialCard)
  const [card, setCard] = chosen ?? own
  const [filters, setFilters] = useState<TaskListFilters>({})
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('')
  const [sort, setSortState] = useState<TaskListSort>(() => readSort(list))
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    const wait = setTimeout(() => { setSearched(search.trim()); setLimit(PAGE) }, SEARCH_WAIT_MS)
    return () => clearTimeout(wait)
  }, [search])

  const setSort = useCallback((next: TaskListSort) => {
    setSortState(next)
    setLimit(PAGE)
    try { window.localStorage.setItem(sortKey(list), next) } catch { /* private window: the choice lasts this visit */ }
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
    showMore: () => setLimit(l => l + PAGE),
    args: { ...filters, card: card ?? undefined, sort, limit, search: searched || undefined },
  }
}
