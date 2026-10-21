import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type PeopleScreen =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'person'; userId: string }
  | { kind: 'remove'; userId: string }
  | { kind: 'leave'; userId: string }

/** Where the People tool is, read from the address: `?tool=people&person=<id>&pview=remove`. */
export function screenOf(params: URLSearchParams): PeopleScreen {
  const userId = params.get('person')
  const view = params.get('pview')
  if (!userId) return view === 'add' ? { kind: 'add' } : { kind: 'list' }
  return view === 'remove' ? { kind: 'remove', userId } : view === 'leave' ? { kind: 'leave', userId } : { kind: 'person', userId }
}

const OWN = ['person', 'pview'] as const

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function usePeopleToolUrl() {
  const [params, setParams] = useSearchParams()
  const go = useCallback((values: Partial<Record<(typeof OWN)[number], string>>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      for (const [name, value] of Object.entries(values)) if (value) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])

  const openTool = useCallback((tool: string, extra: Record<string, string> = {}) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      for (const name of ['task', 'view', 'at']) next.delete(name)
      next.set('tool', tool)
      for (const [name, value] of Object.entries(extra)) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])

  return {
    screen: screenOf(params),
    toList: useCallback(() => go({}), [go]),
    toAdd: useCallback(() => go({ pview: 'add' }), [go]),
    toPerson: useCallback((userId: string) => go({ person: userId }), [go]),
    toRemove: useCallback((userId: string) => go({ person: userId, pview: 'remove' }), [go]),
    toLeave: useCallback((userId: string) => go({ person: userId, pview: 'leave' }), [go]),
    openTool,
  }
}
