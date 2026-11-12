import { Link } from 'react-router'
import { PersonProfileTrigger } from '../../../people/PersonProfileCard'
import { useState } from 'react'
import { useAction, updateUserRole } from 'wasp/client/operations'
import { useAttentionWhen } from '@agenthix/ui/attention'
import { useDemo } from '../../../demo/useDemo'
import { NativeSelect } from '@agenthix/ui/primitives'
import { ROW_BUTTON } from '@agenthix/ui/people'
import type { OrgPersonRow } from '../../../settings/orgPeopleQueries'
import { PersonFace } from './PersonFace'
import { FLEET_ADMIN_GIVEN_IN_FLEET_CONSOLE, ORG_ROLE_CHOICES, monthYear, projectCountText, shortDate, shownHandle, type OrgRole } from './peopleFormat'

/** One row's columns on a desktop; on a phone each cell stacks under the name. */
export const ROW_GRID = 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 md:grid-cols-[auto_minmax(0,1fr)_120px_130px_minmax(96px,auto)] md:gap-x-4'
export const CELL = 'col-start-2 text-small md:col-start-auto'

export function OrgRoleSelect({ userId, role, label }: { userId: string; role: OrgRole; label: string }) {
  const update = useAction(updateUserRole)
  const [error, setError] = useState<string | null>(null)
  const [next, setNext] = useState<OrgRole>(role)
  const errorDialog = useAttentionWhen(error, { kind: 'alert', title: 'The role was not changed', retry: () => change(next) })
  const change = (r: OrgRole) => { setError(null); setNext(r); void update({ userId, role: r }).catch(err => setError(err instanceof Error ? err.message : String(err))) }
  return (
    <>
    <NativeSelect
      size="sm"
      aria-label={label}
      value={role}
      onChange={e => change(e.target.value as OrgRole)}
      className="w-auto"
    >
      {ORG_ROLE_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
    </NativeSelect>
    {errorDialog}
    </>
  )
}

function Row({ row }: { row: OrgPersonRow }) {
  const { person } = row
  const demo = useDemo()
  const handle = shownHandle(person, demo.on)
  const gone = person.state !== 'active'
  return (
    <li className={`relative ${ROW_GRID} rounded-lg px-2 py-3 hover:bg-surface-hover`}>
      <PersonProfileTrigger userId={person.userId}><span className="relative z-10 block"><PersonFace person={person} /></span></PersonProfileTrigger>
      <div className="min-w-0">
        <Link to={`/admin/people/${person.userId}`} className={ROW_BUTTON}>
          <span className="font-medium">{person.name}</span>{row.isMe && <span className="ml-2 text-small font-normal text-text-muted">you</span>}
        </Link>
        <div className="truncate text-small text-text-muted">{person.handle ? handle : 'Erased'}</div>
      </div>
      <div className={`${CELL} relative z-10`}>
        {!gone && row.orgRole && (
          row.isMe
            ? <span className="text-text-secondary">{ORG_ROLE_CHOICES.find(c => c.value === row.orgRole)?.label}</span>
            : <OrgRoleSelect userId={person.userId} role={row.orgRole} label={`Organisation role of ${person.name}`} />
        )}
        {!gone && row.fleetAdmin && <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-micro font-medium text-text-secondary">Fleet admin</span>}
      </div>
      <div className={`${CELL} text-text-secondary`}>{gone ? '' : projectCountText(row.projectCount)}</div>
      <div className={`${CELL} text-text-muted md:text-right`}>
        {gone ? `Left ${shortDate(row.leftAt)}` : <>Joined {monthYear(row.joinedAt)}</>}
      </div>
    </li>
  )
}

export function ListHead() {
  return (
    <div aria-hidden="true" className="hidden px-2 pb-1 text-small text-text-muted md:grid md:grid-cols-[32px_minmax(0,1fr)_120px_130px_minmax(96px,auto)] md:gap-x-4">
      <span /><span>Name</span><span>Organisation role</span><span>Projects</span><span className="text-right">Joined</span>
    </div>
  )
}

export function PeopleList({ title, rows }: { title?: string; rows: OrgPersonRow[] }) {
  if (rows.length === 0) return null
  return (
    <section aria-label={title ?? 'Everyone'} className="mb-8">
      <h2 className="flex justify-between text-micro font-medium uppercase tracking-wide text-text-muted">
        <span>{title ?? 'People'}</span><span className="font-normal normal-case tracking-normal">{rows.length}</span>
      </h2>
      {!title && <ListHead />}
      <ul className="divide-y divide-border-subtle">{rows.map(r => <Row key={r.person.userId} row={r} />)}</ul>
      {rows.some(r => r.fleetAdmin) && <p className="mt-2 text-small text-text-muted">{FLEET_ADMIN_GIVEN_IN_FLEET_CONSOLE}</p>}
    </section>
  )
}
