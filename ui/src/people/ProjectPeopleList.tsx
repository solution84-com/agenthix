import type { ReactNode } from 'react'
import { NowLabel } from '../agents/ProjectAgentParts'
import { TASK_BUTTON } from '../tasks/TasksToolParts'
import { personStatusLine, projectRoleLabel } from './personLines'
import type { ProjectPersonRowData, RenderPersonAvatar } from './types'

/** One button whose ::after covers the whole row, so the row is the tap target; a picture's profile trigger sits above it. */
export const ROW_BUTTON = [
  'block max-w-full truncate rounded-lg text-left text-body text-text-primary hover:text-accent',
  'after:absolute after:inset-0 after:rounded-lg after:content-[\'\']',
  'focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent',
].join(' ')

export interface ProjectPeopleListProps {
  people: ProjectPersonRowData[]
  meId: string
  accessLevel: 'OPEN' | 'PRIVATE'
  now: Date
  renderAvatar: RenderPersonAvatar
  /** Wraps a picture so a click opens the person's profile card. */
  profileOf?: (userId: string, children: ReactNode) => ReactNode
  onOpenPerson: (userId: string) => void
  /** Absent where the person may not manage people here. */
  onAdd?: () => void
  /** Drops the count and ＋ Add above the list, for a view that shows people among other members. */
  hideHeader?: boolean
  /** The teams that bring a person here (adr-0103), by name, and whether they are also here in their own right. */
  teamsOf?: (userId: string) => { names: string[]; direct: boolean } | undefined
}

/**
 * The People tool's list (every screen reviewed spec §3): each member as a picture, a name with their role here in
 * quiet text, the whole row opening the person, one status line, and a count at the right when something waits on them.
 */
export function ProjectPeopleList({ people, meId, accessLevel, now, renderAvatar, profileOf, onOpenPerson, onAdd, hideHeader, teamsOf }: ProjectPeopleListProps) {
  const profile = profileOf ?? ((_id: string, children: ReactNode) => children)
  return (
    <div className="pb-6">
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <p className="text-small text-text-muted">
            {accessLevel === 'OPEN' ? 'Open project' : 'Private project'} · {people.length} {people.length === 1 ? 'person' : 'people'}
          </p>
          {onAdd && <button type="button" className={TASK_BUTTON} onClick={onAdd}>＋ Add</button>}
        </div>
      )}
      {people.length === 0 ? (
        <p className="px-4 pt-4 text-small text-text-muted">No one is in this project yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle px-2 pt-2">
          {people.map(row => {
            const isMe = row.person.userId === meId
            const line = personStatusLine(row, isMe, now)
            const teams = teamsOf?.(row.person.userId)
            return (
              <li key={row.person.userId} className="relative flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover">
                {profile(row.person.userId, <span className="relative z-10 shrink-0">{renderAvatar(row.person, 'md')}</span>)}
                <div className="min-w-0 flex-1">
                  <button
                    type="button" onClick={() => onOpenPerson(row.person.userId)} aria-label={`Open ${row.person.name}`}
                    className={ROW_BUTTON}
                  >
                    <span className="font-semibold">{row.person.name}</span>
                    <span className="ml-1 text-small font-normal text-text-muted">· {projectRoleLabel(row.role)}{isMe ? ' · you' : ''}</span>
                  </button>
                  {teams && teams.names.map(name => (
                    <span key={name} className="relative z-10 ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-micro font-medium text-text-secondary">{name}</span>
                  ))}
                  <p className="truncate text-small text-text-secondary">
                    <NowLabel tone={line.tone}>{line.label}</NowLabel>
                    {line.detail && <> · {line.detail}</>}
                    {teams && <span className="text-text-muted"> · {teams.direct ? 'Also added in person' : `Through ${teams.names.join(', ')} — change in the team`}</span>}
                  </p>
                </div>
                {row.now.needsYouCount > 0 && (
                  <span className="shrink-0 rounded-full border border-warning/40 px-2 text-micro font-semibold text-warning" aria-label={`${row.now.needsYouCount} waiting`}>
                    {row.now.needsYouCount}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
