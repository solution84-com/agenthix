import type { ReactNode } from 'react'
import { TasksViewHeader } from '../tasks/TasksToolParts'
import { tasksLine } from '../agents/agentNowLines'
import { LinkButton, Section, Facts, NowLabel } from '../agents/ProjectAgentParts'
import { PROJECT_ROLE_CHOICES, dayText, localTime, orgRoleLabel, personStatusLine, projectRoleLabel, sinceMonth } from './personLines'
import type { ProjectPersonDetailData, ProjectRoleData, RenderPersonAvatar } from './types'

export interface ProjectPersonViewProps {
  detail: ProjectPersonDetailData
  now: Date
  /** The last admin can be neither demoted nor removed; hq works it out from the whole list. */
  lastAdmin: boolean
  /** A personal project has one member for good; no change is offered. */
  personal?: boolean
  renderAvatar: RenderPersonAvatar
  profileOf?: (userId: string, children: ReactNode) => ReactNode
  onBack: () => void
  /** The view this goes back to: "People", or "Members". */
  backLabel?: string
  onOpenTasks: () => void
  onOpenWaiting: (taskKey: string) => void
  onSetRole: (role: ProjectRoleData) => void
  onManageInOrganisation: () => void
  onRemove: () => void
  onLeave: () => void
  roleError?: string
  /**
   * Set when teams bring the person here (adr-0103): their names, whether the person is also here in their own right,
   * and the role they hold in their own right. Someone here only through teams is changed through the team.
   */
  teams?: { names: string[]; direct: boolean; ownRole: ProjectRoleData | null }
}

/** One person opened inside the People tool: who they are here, what waits on them, their tasks, their role. */
export function ProjectPersonView(p: ProjectPersonViewProps) {
  const { detail } = p
  const { person } = detail
  const profile = p.profileOf ?? ((_id: string, children: ReactNode) => children)
  const time = localTime(detail.timezone, p.now)
  const status = personStatusLine(detail, detail.isMe, p.now)
  const waiting = detail.items.filter(i => i.kind === 'needsYou')
  const onlyThroughTeams = !!p.teams && !p.teams.direct
  const mayChangeRole = detail.canManage && !p.lastAdmin && !p.personal && !onlyThroughTeams
  const mayRemove = detail.canManage && !detail.isMe && !p.lastAdmin && !p.personal && !onlyThroughTeams
  const mayLeave = detail.isMe && !p.lastAdmin && !p.personal && !onlyThroughTeams
  const ownRole = p.teams?.direct ? p.teams.ownRole ?? detail.role : detail.role

  return (
    <div className="pb-6">
      <TasksViewHeader back={p.backLabel ?? 'People'} onBack={p.onBack} />
      <div className="flex items-center gap-3 px-4 pt-4">
        {profile(person.userId, <span className="shrink-0">{p.renderAvatar(person, 'lg')}</span>)}
        <div className="min-w-0">
          <p className="truncate text-h3 font-semibold text-text-primary">
            {person.name}
            <span className="ml-1 text-small font-normal text-text-muted">· {projectRoleLabel(detail.role)}</span>
          </p>
          <p className="truncate text-small text-text-muted">
            {[person.handle ? `@${person.handle}` : null, time ? `${time} local time` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="text-small"><NowLabel tone={status.tone}>{status.label}</NowLabel>{status.detail && <span className="text-text-secondary"> · {status.detail}</span>}</p>
        </div>
      </div>

      <Section title={detail.isMe ? 'Waiting on you' : `Waiting on ${person.name}`}>
        {waiting.length === 0 ? (
          <p className="text-small text-text-muted">Nothing is waiting.</p>
        ) : (
          <ul className="space-y-1.5">
            {waiting.map(item => (
              <li key={item.taskId} className="flex items-baseline gap-2 text-small">
                <button type="button" onClick={() => p.onOpenWaiting(item.key)} className="shrink-0 rounded font-medium text-accent hover:underline">{item.key}</button>
                <span className="min-w-0 flex-1 truncate text-text-primary">{item.title}</span>
                {item.reason && <span className="min-w-0 truncate text-warning">{item.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={detail.isMe ? 'Tasks on your behalf' : `Tasks on ${person.name}'s behalf`} action={<LinkButton onClick={p.onOpenTasks}>Open in Tasks</LinkButton>}>
        <p className="text-small text-text-secondary">{tasksLine(detail.tasks)}</p>
      </Section>

      <Section title="Role">
        <Facts rows={[
          ['Here', mayChangeRole ? (
            <select
              aria-label={`${person.name}'s role in this project`}
              value={ownRole}
              onChange={e => p.onSetRole(e.target.value as ProjectRoleData)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-small text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {PROJECT_ROLE_CHOICES.map(r => <option key={r} value={r}>{projectRoleLabel(r)}</option>)}
            </select>
          ) : (
            <span title={p.lastAdmin ? 'A project always has an admin. Appoint another before changing this one.' : undefined}>{projectRoleLabel(detail.role)}</span>
          )],
          ...(p.teams && p.teams.names.length > 0
            ? [['Through', onlyThroughTeams ? `${p.teams.names.join(', ')} — change it in the team` : `${p.teams.names.join(', ')} — the higher role applies`] as [string, ReactNode]]
            : []),
          ['Organisation', `${orgRoleLabel(detail.orgRole)}${detail.orgJoinedAt ? ` · ${sinceMonth(detail.orgJoinedAt)}` : ''}`],
          ['In this project', `since ${dayText(detail.joinedAt)}`],
        ]} />
        {p.roleError && <p role="alert" className="text-small text-danger">{p.roleError}</p>}
      </Section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-6 text-small">
        {detail.viewerIsOrgAdmin && <LinkButton onClick={p.onManageInOrganisation}>Manage in Organisation ›</LinkButton>}
        {mayRemove && (
          <button type="button" onClick={p.onRemove} className="rounded text-small text-danger hover:underline">Remove from this project</button>
        )}
        {mayLeave && (
          <button type="button" onClick={p.onLeave} className="rounded text-small text-danger hover:underline">Leave this project</button>
        )}
      </div>
      {p.lastAdmin && (detail.isMe || detail.canManage) && (
        <p className="px-4 pt-2 text-micro text-text-muted">{detail.isMe ? 'You are' : 'They are'} the project&apos;s only admin. Appoint another admin first.</p>
      )}
    </div>
  )
}
