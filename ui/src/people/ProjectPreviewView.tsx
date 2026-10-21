import type { ReactNode } from 'react'
import { TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import { sinceText } from '../agents/agentNowLines'
import type { RenderAgentAvatar } from '../agents/ProjectAgentParts'
import { dayText } from './personLines'
import type { ProjectPreviewData, RenderPersonAvatar } from './types'

export interface ProjectPreviewViewProps {
  preview: ProjectPreviewData
  now: Date
  renderPersonAvatar: RenderPersonAvatar
  renderAgentAvatar: RenderAgentAvatar
  profileOf?: (userId: string, children: ReactNode) => ReactNode
  agentProfileOf?: (agentId: string, children: ReactNode) => ReactNode
  joining: boolean
  error?: string
  onJoin: () => void
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-6 space-y-2">
      <h3 className="flex items-center gap-2 border-b border-border-subtle pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">
        {title}{count !== undefined && <span className="text-text-secondary">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function lately(p: ProjectPreviewData, now: Date): string {
  const parts = [`${p.openTaskCount} open ${p.openTaskCount === 1 ? 'task' : 'tasks'}`]
  if (p.runningCount > 0) parts.push(`${p.runningCount} running now`)
  parts.push(p.lastRunAt ? `last run ${sinceText(new Date(p.lastRunAt).toISOString(), now)} ago` : 'nothing has run yet')
  return parts.join(' · ')
}

const MAX_FACES = 8

type Face = { key: string; face: ReactNode; name: string }

/** Each picture with its name beside it, as many as fit across and wrapping; the rest counted. */
function Faces({ faces, empty }: { faces: Face[]; empty: string }) {
  if (faces.length === 0) return <p className="text-small text-text-muted">{empty}</p>
  const more = faces.length - MAX_FACES
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {faces.slice(0, MAX_FACES).map(f => (
        <span key={f.key} className="flex min-w-0 max-w-[14rem] items-center gap-2">
          {f.face}
          <span className="min-w-0 truncate text-small text-text-secondary" title={f.name}>{f.name}</span>
        </span>
      ))}
      {more > 0 && <span className="text-small text-text-muted">and {more} more</span>}
    </div>
  )
}

/**
 * An open project the person has not joined (every screen reviewed spec §3, People): what it is, who is in it,
 * how busy it is, and Join. Its conversations, tools and message box are not shown.
 */
export function ProjectPreviewView(p: ProjectPreviewViewProps) {
  const { project } = p.preview
  const profile = p.profileOf ?? ((_id: string, children: ReactNode) => children)
  const agentProfile = p.agentProfileOf ?? ((_id: string, children: ReactNode) => children)
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6" data-testid="project-preview">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 font-semibold text-text-primary">{project.name}</h1>
          {project.description && <p className="mt-0.5 text-body text-text-secondary">{project.description}</p>}
        </div>
        {p.preview.canJoin && (
          <button type="button" className={TASK_BUTTON_PRIMARY} disabled={p.joining} onClick={p.onJoin}>
            {p.joining ? 'Joining…' : 'Join this project'}
          </button>
        )}
      </div>
      <p className="mt-3 text-body text-text-secondary">
        You are not in this project. Join to talk to its agents, start work and approve. You can leave again at any time.
      </p>
      {p.error && <p role="alert" className="mt-2 text-small text-danger">{p.error}</p>}

      <Block title="About">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
          {([
            ['Lead', project.lead?.name ?? 'None'],
            ['Product', project.product?.name ?? 'None'],
            ['Site', project.site?.label ?? 'None'],
            ['Started', dayText(project.startedAt)],
          ] as const).map(([label, value]) => (
            <div key={label} className="contents"><dt className="text-text-muted">{label}</dt><dd className="min-w-0 truncate text-text-primary">{value}</dd></div>
          ))}
        </dl>
      </Block>

      <Block title="People" count={p.preview.people.length}>
        <Faces
          faces={p.preview.people.map(person => ({
            key: person.userId, name: person.name,
            face: <span className="shrink-0">{profile(person.userId, <span>{p.renderPersonAvatar(person, 'md')}</span>)}</span>,
          }))}
          empty="No one is in this project yet."
        />
      </Block>

      <Block title="Agents" count={p.preview.agents.length}>
        <Faces
          faces={p.preview.agents.map(agent => ({
            key: agent.id, name: agent.name,
            face: <span className="shrink-0">{agentProfile(agent.id, <span>{p.renderAgentAvatar(agent, 'md')}</span>)}</span>,
          }))}
          empty="No agents in this project yet."
        />
      </Block>

      <Block title="Lately">
        <p className="text-small text-text-secondary">{lately(p.preview, p.now)}</p>
      </Block>
    </div>
  )
}
