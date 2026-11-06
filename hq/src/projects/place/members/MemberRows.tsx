import type { ReactNode } from 'react'
import { NativeSelect } from '@agenthix/ui/primitives'
import { ROW_BUTTON, lastHereText, personStatusLine } from '@agenthix/ui/people'
import { nowLine } from '@agenthix/ui/agents'
import type { AgentMember, MemberRow, PersonMember, ProjectRole, TeamMember } from '../../memberList'
import { MoreMenu, type MenuItem } from '../../../org/components/menus'
import { teamMix } from '../../../org/components/teams/teamWords'
import { personAvatarOf } from '../../../people/AuthedPersonAvatar'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { avatarOf } from '../../agents/avatarOf'
import { ROLE_ORDER, ROLE_WORD, agentSource, agentThroughTeamHint, higherRoles, personSource, throughTeamHints } from './memberWords'

/** Member · Role here · Lately · ⋯, the same for every row; Lately goes on a narrow screen. */
export const MEMBER_GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(6rem,0.9fr)_2.25rem] items-center gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(6rem,0.9fr)_minmax(0,1.2fr)_2.25rem]'

export type MemberRowActions = {
  canManagePeople: boolean
  canAssignAgents: boolean
  /** The team the list is narrowed to, if any. */
  narrowedTo: string | null
  onOpenPerson: (userId: string) => void
  onOpenAgent: (agentId: string) => void
  onNarrow: (teamId: string) => void
  onMakeDirect: (row: PersonMember) => void
  onRemovePerson: (userId: string) => void
  onRemoveAgent: (agentId: string) => void
  onRemoveTeam: (teamId: string) => void
  onTeamRole: (teamId: string, role: ProjectRole) => void
}

const TONE = { needs: 'text-warning', live: 'text-accent', muted: 'text-text-muted' } as const

function TeamChips({ teams }: { teams: { id: string; name: string }[] }) {
  return <>{teams.map(t => <span key={t.id} className="ml-1.5 shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-micro font-medium text-text-secondary">{t.name}</span>)}</>
}

function Lately({ tone, label, detail }: { tone: keyof typeof TONE; label: string; detail?: string }) {
  return (
    <p className="hidden min-w-0 truncate text-small sm:block">
      <span className={TONE[tone]}>{label}</span>
      {detail && <span className="text-text-muted"> · {detail}</span>}
    </p>
  )
}

function Role({ word, source }: { word: string; source: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-small text-text-primary">{word}</p>
      <p className="truncate text-micro text-text-muted" title={source}>{source}</p>
    </div>
  )
}

/** The name cell: the whole row is its button, so the picture and the ⋯ sit above it. */
function NameCell({ avatar, name, after, line, onOpen, label }: { avatar: ReactNode; name: string; after?: ReactNode; line: string | null; onOpen: () => void; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative z-10 shrink-0">{avatar}</span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center">
          <button type="button" onClick={onOpen} aria-label={label} className={`${ROW_BUTTON} font-semibold`}>{name}</button>
          {after}
        </div>
        {line && <p className="truncate text-small text-text-muted">{line}</p>}
      </div>
    </div>
  )
}

function personMenu(row: PersonMember, a: MemberRowActions): MenuItem[] {
  if (row.ownRole !== null) {
    return [
      { label: 'Change role', hint: 'Opens their page here', onSelect: () => a.onOpenPerson(row.id) },
      { label: 'Remove from this project', danger: true, onSelect: () => a.onRemovePerson(row.id) },
    ]
  }
  const hints = throughTeamHints(row.name, row.teams)
  const higher = higherRoles(row.teams)
  const first = row.teams[0]
  return [
    {
      label: `Make ${row.name.split(/\s+/)[0]} a direct member…`, hint: 'Give them a role of their own, higher than the team gives',
      disabled: higher.length === 0, title: higher.length === 0 ? 'The team already gives them the highest role.' : undefined,
      onSelect: () => a.onMakeDirect(row),
    },
    { label: 'Change role', hint: `Set by ${row.teams.map(t => t.name).join(', ')}`, disabled: true, title: hints.changeRole, onSelect: () => {} },
    ...(first ? [{ label: `Open ${first.name}`, onSelect: () => a.onNarrow(first.id) }] : []),
    { label: 'Remove from this project', hint: `Here through ${row.teams.map(t => t.name).join(', ')}`, disabled: true, title: hints.remove, onSelect: () => {} },
  ]
}

function PersonRow({ row, a, at }: { row: PersonMember; a: MemberRowActions; at: Date }) {
  const line = personStatusLine({ person: { userId: row.id, name: row.name, handle: row.handle, avatarUrl: row.avatarUrl, state: 'active' }, now: row.now, lastActiveAt: row.lastActiveAt }, row.isMe, at)
  const subline = [row.isLead ? 'Lead' : null, row.handle ? `@${row.handle}` : null].filter(Boolean).join(' · ')
  return (
    <>
      <NameCell
        avatar={personAvatarOf({ userId: row.id, name: row.name, avatarUrl: row.avatarUrl }, 'md')}
        name={row.name} label={`Open ${row.name}`} onOpen={() => a.onOpenPerson(row.id)} line={subline || null}
        after={<>{row.isMe && <span className="ml-1.5 shrink-0 text-small text-text-muted">you</span>}<TeamChips teams={row.teams} /></>}
      />
      <Role word={ROLE_WORD[row.role]} source={personSource(row)} />
      <Lately tone={line.tone} label={line.label} detail={line.detail} />
      <div className="relative z-10">{a.canManagePeople && <MoreMenu label={`More about ${row.name}`} items={personMenu(row, a)} />}</div>
    </>
  )
}

function agentLately(row: AgentMember, at: Date): { tone: keyof typeof TONE; label: string; detail?: string } {
  // The presenter reads dates as text or Date alike (it passes them to `new Date`); Wasp sends them as Date.
  if (row.now.state !== 'idle') return nowLine(row.now as unknown as Parameters<typeof nowLine>[0], at)
  return { tone: 'muted', label: row.lastActiveAt ? `Last ran ${lastHereText(row.lastActiveAt, at)}` : 'Not run here yet' }
}

function AgentRow({ row, a, at }: { row: AgentMember; a: MemberRowActions; at: Date }) {
  const first = row.teams[0]
  const items: MenuItem[] = row.direct
    ? [{ label: 'Remove from this project', danger: true, onSelect: () => a.onRemoveAgent(row.id) }]
    : [
      ...(first ? [{ label: `Open ${first.name}`, onSelect: () => a.onNarrow(first.id) }] : []),
      { label: 'Remove from this project', hint: `Here through ${row.teams.map(t => t.name).join(', ')}`, disabled: true, title: agentThroughTeamHint(row.name, row.teams), onSelect: () => {} },
    ]
  const lately = agentLately(row, at)
  return (
    <>
      <NameCell
        avatar={<span className="relative">{avatarOf({ id: row.id, name: row.name, avatarUrl: row.avatarUrl }, 'md')}<span aria-hidden className="absolute -right-1 -bottom-1 text-micro text-accent">✦</span></span>}
        name={row.name} label={`Open ${row.name}`} onOpen={() => a.onOpenAgent(row.id)} line={row.description}
        after={<>
          <span className="ml-1.5 shrink-0 text-small text-text-muted">Agent{row.isDefault ? ' · default' : ''}</span>
          <TeamChips teams={row.teams} />
        </>}
      />
      <Role word="Assigned" source={agentSource(row)} />
      <Lately tone={lately.tone} label={lately.label} detail={lately.detail} />
      <div className="relative z-10">{a.canAssignAgents && <MoreMenu label={`More about ${row.name}`} items={items} />}</div>
    </>
  )
}

function TeamRow({ row, a }: { row: TeamMember; a: MemberRowActions }) {
  const narrowed = a.narrowedTo === row.id
  return (
    <>
      <NameCell
        avatar={(
          <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-small font-semibold text-accent">
            {row.name.trim().charAt(0).toUpperCase()}
            <AuthedImg src={row.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </span>
        )}
        name={row.name} label={narrowed ? `${row.name}: everyone in it is shown` : `Show who is in ${row.name}`} onOpen={() => a.onNarrow(row.id)}
        after={<span className="ml-1.5 shrink-0 text-small text-text-muted">Team</span>}
        line={`${teamMix(row.peopleCount, row.agentCount)}${row.addedBy ? ` · added by ${row.addedBy}` : ''}`}
      />
      <div className="relative z-10 min-w-0">
        {a.canManagePeople ? (
          <NativeSelect size="sm" className="w-28" value={row.role} aria-label={`${row.name}'s role here`} onChange={e => a.onTeamRole(row.id, e.target.value as ProjectRole)}>
            {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_WORD[r]}</option>)}
          </NativeSelect>
        ) : <p className="text-small text-text-primary">{ROLE_WORD[row.role]}</p>}
        <p className="text-micro text-text-muted">for its people</p>
      </div>
      <Lately tone="muted" label={narrowed ? 'Everyone in it joins at once' : 'Click to see who is in it'} />
      <div className="relative z-10">
        {a.canManagePeople && (
          <MoreMenu label={`More about ${row.name}`} items={[
            ...(narrowed ? [] : [{ label: 'Show who is in it', onSelect: () => a.onNarrow(row.id) }]),
            { label: 'Remove team', danger: true, onSelect: () => a.onRemoveTeam(row.id) },
          ]} />
        )}
      </div>
    </>
  )
}

/** One row of the one member list, whichever kind it is. */
export function MemberListRow({ row, actions, now }: { row: MemberRow; actions: MemberRowActions; now: Date }) {
  return (
    <li className={`relative rounded-lg px-2 py-2 hover:bg-surface-hover ${MEMBER_GRID}`} data-testid={`member-${row.kind}`}>
      {row.kind === 'person' && <PersonRow row={row} a={actions} at={now} />}
      {row.kind === 'agent' && <AgentRow row={row} a={actions} at={now} />}
      {row.kind === 'team' && <TeamRow row={row} a={actions} />}
    </li>
  )
}
