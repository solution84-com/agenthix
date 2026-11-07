import { useDeferredValue, useState } from 'react'
import { useQuery, useAction, getProjectMemberList, setProjectTeamRole } from 'wasp/client/operations'
import { Plus, X } from 'lucide-react'
import { Button, CONTROL_HEIGHT, EmptyState, FOCUS_RING, SearchField, SortMenu } from '@agenthix/ui/primitives'
import { MEMBER_PAGE, type MemberFilter, type MemberSort, type PersonMember, type ProjectRole } from '../../memberList'
import type { ProjectMemberList } from '../../memberListQuery'
import { useAttention } from '../../../shared/components/AttentionDialog'
import { usePlaceTopBarAdd } from '../../../places/placeCrumb'
import { PEOPLE_REFRESH_MS } from '../people/useProjectPeopleView'
import { reasonOf } from '../people/peopleErrors'
import { AddMembersDialog, type AddTab } from './AddMembersDialog'
import { MakeDirectDialog } from './MakeDirectDialog'
import { MEMBER_GRID, MemberListRow, type MemberRowActions } from './MemberRows'
import { membersLine } from './memberWords'
import type { useMembersUrl } from './useMembersUrl'

const FILTER_WORD: Record<MemberFilter, string> = { everyone: 'Everyone', people: 'People', agents: 'Agents', teams: 'Teams' }
const SORT_WORD: Record<MemberSort, string> = { name: 'Name', added: 'Recently added', active: 'Recently active', needs: 'Needs you first' }
const EMPTY: Record<MemberFilter, string> = { everyone: 'No one is in this project yet.', people: 'No one is in this project yet.', agents: 'No agent is assigned here yet.', teams: 'No team is in this project yet.' }
// The toolbar's chips are the Tasks toolbar's pills: one height with the search box and Sort.
const CHIP = `${CONTROL_HEIGHT} inline-flex shrink-0 items-center gap-1 rounded-full px-3 text-small font-medium ${FOCUS_RING}`

/** Where the first agent will appear: what an agent is for here, and the one control that adds it. */
function NoAgentRow({ onAssign }: { onAssign?: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5" data-testid="no-agent-row">
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-text-muted">✦</span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-text-primary">No agent here yet</p>
        <p className="text-small text-text-muted">An agent does this project's tasks and answers in its conversations. The first one added becomes the default.</p>
      </div>
      {onAssign && <Button variant="secondary" onClick={onAssign}>Assign an agent</Button>}
    </li>
  )
}

/**
 * A project's Members: one list of its people, agents and teams, each row the same — who, their role here and where it
 * comes from, what they did lately, and ⋯ — with a search over all, filters with counts, a sort, and one Add members
 * dialog. A team row narrows the list to the team. The server merges, filters, sorts and pages (`memberListQuery.ts`).
 */
export function MembersListScreen({ projectId, url }: { projectId: string; url: ReturnType<typeof useMembersUrl> }) {
  const [filter, setFilter] = useState<MemberFilter>('everyone')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<MemberSort>('name')
  const [team, setTeam] = useState<{ id: string; name: string } | null>(null)
  const [limit, setLimit] = useState(MEMBER_PAGE)
  const [raising, setRaising] = useState<PersonMember | null>(null)
  const typed = useDeferredValue(search)
  const attention = useAttention()
  const setTeamRole = useAction(setProjectTeamRole)
  const q = useQuery(
    getProjectMemberList,
    { projectId, filter, search: typed, sort, teamId: team?.id, limit },
    { refetchInterval: PEOPLE_REFRESH_MS, placeholderData: (previous: unknown) => previous },
  )
  const list = q.data as ProjectMemberList | undefined
  // Below lg the top bar names the view and holds Add members, as Tasks' holds New task (the dialog's first tab).
  const addTab: AddTab | null = list?.canManagePeople ? 'people' : list?.canAssignAgents ? 'agents' : null
  const inTopBar = usePlaceTopBarAdd(addTab ? { label: 'Add members', onClick: () => url.toAdd(addTab) } : null)
  if (q.isLoading && !list) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (!list) return <p role="alert" className="px-4 py-6 text-small text-danger">{q.error?.message ?? 'The members could not be read.'}</p>

  const tabs: AddTab[] = [
    ...(list.canManagePeople ? ['people' as const] : []),
    ...(list.canAssignAgents ? ['agents' as const] : []),
    ...(list.canManagePeople ? ['teams' as const] : []),
  ]
  const refetch = () => void q.refetch()
  const changeTeamRole = async (teamId: string, role: ProjectRole) => {
    try { await setTeamRole({ projectId, teamId, role }); refetch() } catch (err) {
      attention.show({ text: reasonOf(err, "The team's role was not changed. Nothing was changed."), retry: () => void changeTeamRole(teamId, role) })
    }
  }
  const narrow = (teamId: string) => {
    const row = list.rows.find(r => r.id === teamId)
    const name = row?.kind === 'team' ? row.name : [...list.rows].flatMap(r => (r.kind === 'team' ? [] : r.teams)).find(t => t.id === teamId)?.name
    setTeam({ id: teamId, name: name ?? 'team' })
    setLimit(MEMBER_PAGE)
  }
  const actions: MemberRowActions = {
    canManagePeople: list.canManagePeople, canAssignAgents: list.canAssignAgents, narrowedTo: team?.id ?? null,
    onOpenPerson: url.toPerson, onOpenAgent: url.toAgent, onNarrow: narrow, onMakeDirect: setRaising,
    onRemovePerson: url.toRemovePerson, onRemoveAgent: url.toRemoveAgent, onRemoveTeam: url.toRemoveTeam,
    onTeamRole: (teamId, role) => void changeTeamRole(teamId, role),
  }
  const countOf: Record<MemberFilter, number> = list.counts
  const showNoAgent = list.totals.agents === 0 && !list.project.personal && !typed && !team && (filter === 'everyone' || filter === 'agents')
  const now = new Date()

  return (
    <div className="px-4 pb-6 pt-4" data-testid="members-list">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className={`text-h2 font-semibold text-text-primary ${inTopBar ? 'max-lg:hidden' : ''}`}>Members</h2>
          <p className="text-small text-text-muted">{membersLine(list.totals)}</p>
        </div>
        {tabs.length > 0 && <Button className={inTopBar ? 'max-lg:hidden' : ''} leadingIcon={<Plus size={14} aria-hidden />} onClick={() => url.toAdd(tabs[0])}>Add members</Button>}
      </div>

      <div role="toolbar" aria-label="Search, show and sort" className="flex flex-wrap items-center gap-2 pt-4">
        <SearchField label="Search members" value={search} onChange={v => { setSearch(v); setLimit(MEMBER_PAGE) }} className="min-w-[12rem] flex-1 max-sm:basis-full" />
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_WORD) as MemberFilter[]).map(f => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setLimit(MEMBER_PAGE) }}
              className={`${CHIP} ${filter === f ? 'border border-accent bg-accent-subtle text-accent' : 'border border-border bg-surface-1 text-text-secondary hover:bg-surface-hover'}`}>
              {FILTER_WORD[f]} {countOf[f]}
            </button>
          ))}
        </div>
        {team && (
          <button type="button" onClick={() => setTeam(null)} aria-label={`Show everyone, not only ${team.name}`} className={`${CHIP} border border-accent bg-accent-subtle text-accent`}>
            Team: {team.name}
            <X size={13} aria-hidden />
          </button>
        )}
        <div className="ml-auto">
          <SortMenu value={sort} choices={(Object.keys(SORT_WORD) as MemberSort[]).map(s => ({ value: s, label: SORT_WORD[s] }))} onChange={setSort} />
        </div>
      </div>

      <div className={`mt-4 border-b border-border-subtle pb-1 text-micro font-semibold uppercase tracking-wide text-text-muted ${MEMBER_GRID}`} aria-hidden>
        <span>Member</span><span>Role here</span><span className="hidden sm:block">Lately</span><span />
      </div>
      <ul className="divide-y divide-border-subtle" aria-label="Members">
        {list.rows.map(row => <MemberListRow key={`${row.kind}-${row.id}`} row={row} actions={actions} now={now} />)}
        {showNoAgent && <NoAgentRow onAssign={list.canAssignAgents ? () => url.toAdd('agents') : undefined} />}
      </ul>
      {list.rows.length === 0 && !showNoAgent && <div className="pt-3"><EmptyState variant="inline" title={typed || team ? 'No one matches.' : EMPTY[filter]} /></div>}
      {list.total > list.rows.length && (
        <div className="flex justify-center pt-3">
          <Button variant="secondary" onClick={() => setLimit(l => l + MEMBER_PAGE)}>Show more · {list.total - list.rows.length} more</Button>
        </div>
      )}

      {url.screen.kind === 'list' && url.screen.adding && tabs.length > 0 && (
        <AddMembersDialog
          projectId={projectId} projectName={list.project.name} tabs={tabs}
          tab={tabs.includes(url.screen.adding) ? url.screen.adding : tabs[0]} onTab={url.toAdd}
          onClose={url.toList} onChanged={refetch} onProblem={attention.show}
        />
      )}
      {raising && (
        <MakeDirectDialog projectId={projectId} person={raising} onClose={() => setRaising(null)} onDone={() => { setRaising(null); refetch() }} onProblem={attention.show} />
      )}
      {attention.dialog}
    </div>
  )
}
