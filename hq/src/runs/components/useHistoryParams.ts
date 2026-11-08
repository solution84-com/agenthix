import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { localMidnight } from '../../shared/utils/localMidnight'
import type { RunHistoryArgs } from '../historyTypes'

/** The address's names for the history's filters; `state` is what a Workroom's counts link with. */
const KEYS = {
  state: 'state', kind: 'kind', when: 'when', sort: 'sort', whose: 'whose', startedBy: 'by', agentId: 'agent',
  taskKey: 'task', place: 'project', conversationId: 'conversation', search: 'q', page: 'page',
} as const
type Key = keyof typeof KEYS

/** What `getRunHistory` is asked for, read from and written to the address, so a way in arrives with its filters. */
export function useHistoryParams(projectKey?: string) {
  const [params, setParams] = useSearchParams()
  const args = useMemo<RunHistoryArgs>(() => {
    const get = (k: Key) => params.get(KEYS[k]) ?? undefined
    const page = Number(get('page'))
    return {
      projectKey,
      state: get('state') as RunHistoryArgs['state'], kind: get('kind') as RunHistoryArgs['kind'],
      when: get('when') as RunHistoryArgs['when'], sort: get('sort') as RunHistoryArgs['sort'],
      whose: get('whose') as RunHistoryArgs['whose'], startedBy: get('startedBy') as RunHistoryArgs['startedBy'],
      agentId: get('agentId'), taskKey: get('taskKey'), place: get('place'), conversationId: get('conversationId'),
      search: get('search'), page: Number.isInteger(page) && page > 1 ? page : undefined,
      todayFrom: localMidnight(),
    }
  }, [params, projectKey])

  /** Sets one filter (empty or its default clears it) and goes back to the first page, unless it is the page. */
  const set = useCallback((key: Key, value: string | number | null) => {
    setParams(p => {
      const q = new URLSearchParams(p)
      const v = value === null || value === '' || value === 'all' || value === 'any' || value === 'newest' ? null : String(value)
      if (v === null || (key === 'page' && v === '1')) q.delete(KEYS[key])
      else q.set(KEYS[key], v)
      if (key !== 'page') q.delete(KEYS.page)
      return q
    }, { replace: true })
  }, [setParams])

  /** Every filter cleared: "See every run". */
  const clear = useCallback(() => {
    setParams(p => {
      const q = new URLSearchParams(p)
      for (const name of Object.values(KEYS)) q.delete(name)
      return q
    }, { replace: true })
  }, [setParams])

  return { args, set, clear }
}
