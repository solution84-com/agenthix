import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type AutomationScreen =
  | { view: 'overview' }
  | { view: 'rules' }
  | { view: 'routines' }
  | { view: 'newRoutine' }
  | { view: 'routine'; routineId: string }

/**
 * Where the Automation tool is, read from the address (every screen reviewed spec §3):
 * `?tool=automation&aview=routines`, `&aview=rules`, `&aview=new-routine`, or a routine at its own
 * address, `&routine=<id>`. Its names start with `a` where another tool might use the same idea.
 */
export function automationScreenOf(params: URLSearchParams): AutomationScreen {
  const routineId = params.get('routine')
  if (routineId) return { view: 'routine', routineId }
  const view = params.get('aview')
  if (view === 'rules') return { view: 'rules' }
  if (view === 'routines') return { view: 'routines' }
  if (view === 'new-routine') return { view: 'newRoutine' }
  return { view: 'overview' }
}

const OWN = ['aview', 'routine'] as const

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function useAutomationToolUrl() {
  const [params, setParams] = useSearchParams()
  const screen = automationScreenOf(params)

  const go = useCallback((values: Partial<Record<(typeof OWN)[number], string>>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      for (const [name, value] of Object.entries(values)) if (value) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])

  return {
    screen,
    toOverview: useCallback(() => go({}), [go]),
    toRules: useCallback(() => go({ aview: 'rules' }), [go]),
    toRoutines: useCallback(() => go({ aview: 'routines' }), [go]),
    toNewRoutine: useCallback(() => go({ aview: 'new-routine' }), [go]),
    toRoutine: useCallback((routineId: string) => go({ routine: routineId }), [go]),
  }
}
