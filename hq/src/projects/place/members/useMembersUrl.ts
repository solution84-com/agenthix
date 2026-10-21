import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type MembersScreen = { kind: 'list' } | { kind: 'addTeam' } | { kind: 'removeTeam'; teamId: string }

/** Where the Members tool is beyond the person and agent screens it opens: `?tool=members&mview=add-team`, `&mview=remove-team&team=<id>`. */
export function membersScreenOf(params: URLSearchParams): MembersScreen {
  const view = params.get('mview')
  const teamId = params.get('team')
  if (view === 'add-team') return { kind: 'addTeam' }
  if (view === 'remove-team' && teamId) return { kind: 'removeTeam', teamId }
  return { kind: 'list' }
}

const OWN = ['mview', 'team'] as const

export function useMembersUrl() {
  const [params, setParams] = useSearchParams()
  const go = useCallback((values: Partial<Record<(typeof OWN)[number] | 'person' | 'agent' | 'pview' | 'aview', string>>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of [...OWN, 'person', 'agent', 'pview', 'aview']) next.delete(name)
      for (const [name, value] of Object.entries(values)) if (value) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])
  return {
    screen: membersScreenOf(params),
    toList: useCallback(() => go({}), [go]),
    toAddPerson: useCallback(() => go({ pview: 'add' }), [go]),
    toAddAgent: useCallback(() => go({ aview: 'assign' }), [go]),
    toAddTeam: useCallback(() => go({ mview: 'add-team' }), [go]),
    toRemoveTeam: useCallback((teamId: string) => go({ mview: 'remove-team', team: teamId }), [go]),
    toPerson: useCallback((userId: string) => go({ person: userId }), [go]),
    toAgent: useCallback((agentId: string) => go({ agent: agentId }), [go]),
  }
}
