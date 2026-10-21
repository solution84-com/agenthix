import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type AgentsScreen =
  | { kind: 'list' }
  | { kind: 'assign' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'edit'; agentId: string }
  | { kind: 'remove'; agentId: string }

/** Where the Agents tool is, read from the address: `?tool=agents&agent=<id>&aview=edit`. `&focus=` names the part of an agent to scroll to. */
export function screenOf(params: URLSearchParams): AgentsScreen {
  const agentId = params.get('agent')
  const view = params.get('aview')
  if (!agentId) return view === 'assign' ? { kind: 'assign' } : { kind: 'list' }
  return view === 'edit' ? { kind: 'edit', agentId } : view === 'remove' ? { kind: 'remove', agentId } : { kind: 'agent', agentId }
}

const OWN = ['agent', 'aview', 'focus'] as const

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function useAgentsToolUrl() {
  const [params, setParams] = useSearchParams()
  const go = useCallback((values: Partial<Record<(typeof OWN)[number], string>>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      for (const [name, value] of Object.entries(values)) if (value) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])

  return {
    screen: screenOf(params),
    focus: params.get('focus'),
    toList: useCallback(() => go({}), [go]),
    toAssign: useCallback(() => go({ aview: 'assign' }), [go]),
    toAgent: useCallback((agentId: string) => go({ agent: agentId }), [go]),
    toEdit: useCallback((agentId: string) => go({ agent: agentId, aview: 'edit' }), [go]),
    toRemove: useCallback((agentId: string) => go({ agent: agentId, aview: 'remove' }), [go]),
  }
}

/** Opens another tool of the same place, leaving this tool's own place out of the address. */
export function useOpenTool() {
  const [, setParams] = useSearchParams()
  return useCallback((tool: string, extra: Record<string, string> = {}) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      next.set('tool', tool)
      for (const [name, value] of Object.entries(extra)) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])
}

/** The Files tool's address for a path: a folder opens as `dir`, a file as `file`. */
export function filesAddress(path: string): Record<string, string> {
  return /\.[A-Za-z0-9]+$/.test(path) ? { file: path } : { dir: path }
}
