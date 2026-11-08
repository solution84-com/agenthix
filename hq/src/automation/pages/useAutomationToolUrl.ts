import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type AutomationScreen =
  | { view: 'overview' }
  | { view: 'rules' }

/**
 * Where the Automation tool is, read from the address (every screen reviewed spec §3): its overview, or
 * `?tool=automation&aview=rules`. Its names start with `a` where another tool might use the same idea.
 */
export function automationScreenOf(params: URLSearchParams): AutomationScreen {
  return params.get('aview') === 'rules' ? { view: 'rules' } : { view: 'overview' }
}

const OWN = ['aview'] as const

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
  }
}
