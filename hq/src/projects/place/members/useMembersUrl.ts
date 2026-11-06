import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { AddTab } from './AddMembersDialog'

export type MembersScreen = { kind: 'list'; adding: AddTab | null } | { kind: 'removeTeam'; teamId: string }

const TABS: readonly AddTab[] = ['people', 'agents', 'teams']

/**
 * Where the Members tool is beyond the person and agent screens it opens: `?tool=members&mview=add&tab=agents` for
 * Add members on a tab, `&mview=remove-team&team=<id>`. The older addresses of the three add screens (`pview=add`,
 * `aview=assign`, `mview=add-team`) open the dialog on their tab, so links that name them keep working.
 */
export function membersScreenOf(params: URLSearchParams): MembersScreen {
  const view = params.get('mview')
  const teamId = params.get('team')
  if (view === 'remove-team' && teamId) return { kind: 'removeTeam', teamId }
  const tab = params.get('tab')
  if (view === 'add') return { kind: 'list', adding: TABS.includes(tab as AddTab) ? tab as AddTab : 'people' }
  if (view === 'add-team') return { kind: 'list', adding: 'teams' }
  if (params.get('aview') === 'assign' && !params.get('agent')) return { kind: 'list', adding: 'agents' }
  if (params.get('pview') === 'add' && !params.get('person')) return { kind: 'list', adding: 'people' }
  return { kind: 'list', adding: null }
}

const OWN = ['mview', 'team', 'tab', 'person', 'agent', 'pview', 'aview'] as const

export function useMembersUrl() {
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
    screen: membersScreenOf(params),
    toList: useCallback(() => go({}), [go]),
    toAdd: useCallback((tab: AddTab) => go({ mview: 'add', tab }), [go]),
    toRemoveTeam: useCallback((teamId: string) => go({ mview: 'remove-team', team: teamId }), [go]),
    toPerson: useCallback((userId: string) => go({ person: userId }), [go]),
    toRemovePerson: useCallback((userId: string) => go({ person: userId, pview: 'remove' }), [go]),
    toAgent: useCallback((agentId: string) => go({ agent: agentId }), [go]),
    toRemoveAgent: useCallback((agentId: string) => go({ agent: agentId, aview: 'remove' }), [go]),
  }
}
