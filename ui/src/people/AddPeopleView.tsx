import { useMemo, useState, type ReactNode } from 'react'
import { SearchField } from '../primitives/FilterControls'
import { TasksViewHeader, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import { LinkButton } from '../agents/ProjectAgentParts'
import { PROJECT_ROLE_CHOICES, orgRoleLabel, pickerSubline, projectRoleLabel } from './personLines'
import type { PickablePersonData, ProjectRoleData, RenderPersonAvatar } from './types'

/** The Add button's ::after covers its whole row, so the row adds the person; the picture's profile trigger sits above it. */
const ADD_BUTTON_ROW = "after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"

export interface AddPeopleViewProps {
  people: PickablePersonData[]
  meId: string
  role: ProjectRoleData
  onRoleChange: (role: ProjectRoleData) => void
  renderAvatar: RenderPersonAvatar
  profileOf?: (userId: string, children: ReactNode) => ReactNode
  /** The person being added now, so its button waits. */
  addingId: string | null
  onAdd: (userId: string) => void
  onBack: () => void
  /** The view this goes back to: "People", or "Members". */
  backLabel?: string
  /** Present for organisation admins, who invite people. */
  onInvite?: () => void
  error?: string
}

/** What a search matches: a name or a @handle, ignoring case and a leading @. */
export function matchesPerson(person: { name: string; handle: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, '')
  if (!q) return true
  return person.name.toLowerCase().includes(q) || (person.handle ?? '').toLowerCase().includes(q)
}

/** Add people to a project: everyone in the organisation, a tick for those already here, and the role they join as. */
export function AddPeopleView(p: AddPeopleViewProps) {
  const [query, setQuery] = useState('')
  const profile = p.profileOf ?? ((_id: string, children: ReactNode) => children)
  const shown = useMemo(() => p.people.filter(x => matchesPerson(x.person, query)), [p.people, query])

  return (
    <div className="pb-6">
      <TasksViewHeader back={p.backLabel ?? 'People'} onBack={p.onBack} title="Add people" />
      <div className="flex items-center gap-2 px-4 pt-4 text-small">
        <span className="text-text-muted">Add as</span>
        <div role="radiogroup" aria-label="Add as" className="inline-flex overflow-hidden rounded-lg border border-border">
          {PROJECT_ROLE_CHOICES.map(r => (
            <button
              key={r} type="button" role="radio" aria-checked={p.role === r} onClick={() => p.onRoleChange(r)}
              className={`px-3 py-1 text-small ${p.role === r ? 'bg-accent text-on-accent' : 'bg-surface-1 text-text-secondary hover:bg-surface-hover'}`}
            >
              {projectRoleLabel(r)}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-3">
        <SearchField label="Search by name or @handle" value={query} onChange={setQuery} className="w-full" />
      </div>
      {p.error && <p role="alert" className="px-4 pt-2 text-small text-danger">{p.error}</p>}
      {shown.length === 0 ? (
        <p className="px-4 pt-4 text-small text-text-muted">No one matches.</p>
      ) : (
        <ul className="divide-y divide-border-subtle px-2 pt-2">
          {shown.map(({ person, orgRole, projectCount, isMember }) => (
            <li key={person.userId} className={`relative flex items-center gap-3 rounded-lg px-2 py-2.5 ${isMember ? '' : 'hover:bg-surface-hover'}`}>
              {profile(person.userId, <span className="relative z-10 shrink-0">{p.renderAvatar(person, 'md')}</span>)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-text-primary">{person.name}</p>
                <p className="truncate text-small text-text-muted">
                  {pickerSubline({ handle: person.handle, roleLabel: orgRoleLabel(orgRole), projectCount, isMe: person.userId === p.meId })}
                </p>
              </div>
              {isMember ? (
                <span className="shrink-0 text-body text-success" title="In this project" aria-label="In this project">✓</span>
              ) : (
                <button
                  type="button" className={`${TASK_BUTTON_PRIMARY} ${ADD_BUTTON_ROW}`} disabled={p.addingId !== null}
                  aria-label={`Add ${person.name}`} onClick={() => p.onAdd(person.userId)}
                >
                  {p.addingId === person.userId ? 'Adding…' : 'Add'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {p.onInvite && (
        <p className="px-4 pt-4 text-small text-text-muted">
          Someone new? <LinkButton onClick={p.onInvite}>Invite them in Organisation ›</LinkButton>
        </p>
      )}
    </div>
  )
}
