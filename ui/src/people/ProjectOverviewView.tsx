import type { ReactNode } from 'react'
import { Button } from '../primitives/Button'
import { sinceText } from '../agents/agentNowLines'
import type { RenderAgentAvatar } from '../agents/ProjectAgentParts'
import { dayText } from './personLines'
import type { ProjectPreviewData, RenderPersonAvatar } from './types'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/** Where a member changes what a card says is missing; a link is drawn only for the one given. */
export interface ProjectOverviewActions {
  newTask?: () => void
  chooseLead?: () => void
  addPeople?: () => void
  assignAgent?: () => void
  addDescription?: () => void
  openMembers?: () => void
}

export interface ProjectOverviewViewProps {
  preview: ProjectPreviewData
  now: Date
  renderPersonAvatar: RenderPersonAvatar
  renderAgentAvatar: RenderAgentAvatar
  profileOf?: (userId: string, children: ReactNode) => ReactNode
  agentProfileOf?: (agentId: string, children: ReactNode) => ReactNode
  joining: boolean
  error?: string
  onJoin: () => void
  /** A member's work lists (Needs you, Running, Up next, Recently finished). Drawn only for a member with tasks. */
  work?: ReactNode
  actions?: ProjectOverviewActions
}

const LINK = 'text-small text-link hover:underline'
const CARD_TITLE = 'text-micro font-medium uppercase tracking-wide text-text-muted'

function Card({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-3" aria-label={title}>
      <h3 className={`flex items-center gap-2 ${CARD_TITLE}`}>
        {title}{count !== undefined && <span className="text-text-secondary">{count}</span>}
      </h3>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  )
}

function Missing({ text, link, onClick }: { text: string; link?: string; onClick?: () => void }) {
  return (
    <p className="text-small text-text-muted">
      {text}
      {link && onClick && <> · <button type="button" className={LINK} onClick={onClick}>{link}</button></>}
    </p>
  )
}

const MAX_STACK = 5
const MAX_NAMES = 3

function namesText(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES)
  const more = names.length - shown.length
  if (more <= 0) return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('')
  return `${shown.join(', ')} and ${more} more`
}

function facts(p: ProjectPreviewData): string {
  const { project } = p
  return [
    project.accessLevel === 'OPEN' ? 'Open project' : 'Private project',
    `started ${dayText(project.startedAt)}`,
    project.site ? `on ${project.site.label}` : null,
  ].filter(Boolean).join(' · ')
}

function lastRun(p: ProjectPreviewData, now: Date): string {
  return p.lastRunAt ? `Last run ${sinceText(new Date(p.lastRunAt).toISOString(), now)} ago` : 'Nothing has run yet'
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="min-w-[4.5rem]">
      <div className="text-h2 font-medium text-text-primary">{n}</div>
      <div className="text-small text-text-muted">{label}</div>
    </div>
  )
}

/** A non-member sees how much work there is, never the tasks: the rest is drawn as a faded shape to join for. */
function WorkCounts({ p }: { p: ProjectOverviewViewProps }) {
  const { preview } = p
  return (
    <div data-testid="work-counts">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Count n={preview.openTaskCount} label={preview.openTaskCount === 1 ? 'open task' : 'open tasks'} />
        <Count n={preview.runningCount} label="running" />
        <Count n={preview.doneCount} label="done" />
        <Count n={preview.boardCount} label={preview.boardCount === 1 ? 'board' : 'boards'} />
      </div>
      <p className="mt-2 text-small text-text-muted">{lastRun(preview, p.now)}</p>
      <div className="mt-4" aria-hidden>
        <div className="space-y-2 opacity-40">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2">
              <span className="h-5 w-5 rounded-full bg-surface-2" />
              <span className="h-3 flex-1 rounded bg-surface-2" />
              <span className="h-3 w-12 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-small text-text-secondary">
        {preview.canJoin ? 'Join to see its tasks and boards' : 'People in the project see its tasks and boards'}
      </p>
    </div>
  )
}

function EmptyWork({ onNewTask }: { onNewTask?: () => void }) {
  return (
    <div data-testid="work-empty" className="rounded-xl border border-dashed border-border px-4 py-6">
      <p className="text-body font-medium text-text-primary">No tasks yet</p>
      <p className="mt-0.5 text-small text-text-muted">Say what needs doing, and an agent can start on it.</p>
      {onNewTask && <button type="button" className={`mt-2 ${LINK}`} onClick={onNewTask}>New task</button>}
    </div>
  )
}

function LeadCard({ p }: { p: ProjectOverviewViewProps }) {
  const lead = p.preview.project.lead
  const profile = p.profileOf ?? ((_id: string, children: ReactNode) => children)
  return (
    <Card title="Lead">
      {lead ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0">{profile(lead.userId, <span>{p.renderPersonAvatar(lead, 'md')}</span>)}</span>
          <span className="min-w-0 truncate text-body text-text-primary">{lead.name}</span>
          <span className="text-small text-text-muted">Runs the project</span>
        </div>
      ) : (
        <Missing text="No lead yet" link="Choose one" onClick={p.actions?.chooseLead} />
      )}
    </Card>
  )
}

function PeopleCard({ p }: { p: ProjectOverviewViewProps }) {
  const people = p.preview.people
  const profile = p.profileOf ?? ((_id: string, children: ReactNode) => children)
  return (
    <Card title="People" count={people.length}>
      {people.length === 0 ? (
        <Missing text="No one is in this project yet" link="Add people" onClick={p.actions?.addPeople} />
      ) : (
        <>
          <div className="flex items-center">
            {people.slice(0, MAX_STACK).map((person, i) => (
              <span key={person.userId} className={`shrink-0 rounded-full ring-2 ring-surface-1 ${i > 0 ? '-ml-2' : ''}`}>
                {profile(person.userId, <span>{p.renderPersonAvatar(person, 'md')}</span>)}
              </span>
            ))}
            {people.length > MAX_STACK && <span className="ml-2 text-small text-text-muted">+{people.length - MAX_STACK}</span>}
          </div>
          <p className="text-small text-text-secondary">
            {namesText(people.map(person => person.name))}
            {p.actions?.openMembers && <> · <button type="button" className={LINK} onClick={p.actions.openMembers}>Members</button></>}
          </p>
          {people.length === 1 && p.actions?.addPeople && <Missing text="Only you so far" link="Add people" onClick={p.actions.addPeople} />}
        </>
      )}
    </Card>
  )
}

function AgentsCard({ p }: { p: ProjectOverviewViewProps }) {
  const { agents, project } = p.preview
  const profile = p.agentProfileOf ?? ((_id: string, children: ReactNode) => children)
  return (
    <Card title="Agents" count={agents.length}>
      {agents.length === 0 ? (
        <Missing text="No agent here yet" link="Assign an agent" onClick={p.actions?.assignAgent} />
      ) : (
        agents.map(agent => (
          <div key={agent.id} className="flex items-center gap-2">
            <span className="shrink-0">{profile(agent.id, <span>{p.renderAgentAvatar(agent, 'md')}</span>)}</span>
            <div className="min-w-0">
              <div className="truncate text-body text-text-primary">{agent.name}</div>
              <div className="truncate text-small text-text-muted">
                {[agent.id === project.defaultAgentId ? 'Default agent' : null, agent.role].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        ))
      )}
    </Card>
  )
}

/**
 * One page for every project (every screen reviewed spec §3, P4): a header with the project's name, description and
 * facts, Join project when the person is not in it; the work on the left (a member's lists, or counts and a faded shape
 * for anyone else, or what is missing in an empty project); the lead, the people and the agents on the right. Nothing
 * here carries a task's id or title unless the caller passes it as `work`, which only a member's page does.
 */
export function ProjectOverviewView(p: ProjectOverviewViewProps) {
  const errorDialog = useAttentionWhen(p.error)
  const { project } = p.preview
  const member = p.preview.isMember
  return (
    <div className="w-full px-4 py-5 lg:px-6" data-testid="project-overview">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 font-medium text-text-primary">{project.name}</h1>
          {project.description ? (
            <p className="mt-0.5 text-body text-text-secondary">{project.description}</p>
          ) : (
            member && p.actions?.addDescription && (
              <button type="button" className={`mt-0.5 ${LINK}`} onClick={p.actions.addDescription}>＋ Add a description</button>
            )
          )}
          <p className="mt-1 text-small text-text-muted">{facts(p.preview)}</p>
        </div>
        {(p.preview.canJoin || !member) && (
          <Button size="sm" disabled={p.preview.canJoin && p.joining} onClick={p.onJoin}
            refusal={p.preview.canJoin ? undefined : { reason: 'Ask someone in it, or an admin, to add you.', title: 'You cannot join this project' }}>
            {p.joining ? 'Joining…' : 'Join project'}
          </Button>
        )}
      </div>
      {errorDialog}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="The work" className="min-w-0">
          <h2 className={`border-b border-border-subtle pb-1 ${CARD_TITLE}`}>The work</h2>
          <div className="mt-3">
            {!member ? <WorkCounts p={p} /> : p.preview.taskCount === 0 ? <EmptyWork onNewTask={p.actions?.newTask} /> : p.work}
          </div>
        </section>
        <div className="space-y-3">
          <LeadCard p={p} />
          <PeopleCard p={p} />
          <AgentsCard p={p} />
        </div>
      </div>
    </div>
  )
}
