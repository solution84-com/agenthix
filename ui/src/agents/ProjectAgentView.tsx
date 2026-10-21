import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'
import { NewTaskRow } from '../tasks/NewTaskRow'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import { comingUpLine, nowItemLine, sinceText, tasksLine, whenText } from './agentNowLines'
import { ProjectAgentInThisProject } from './ProjectAgentInThisProject'
import { ProjectAgentInstructions } from './ProjectAgentInstructions'
import { LinkButton, Section, type RenderAgentAvatar } from './ProjectAgentParts'
import type { PlaceInstructionsData, ProjectAgentDetailData, RecentRunData } from './projectAgentTypes'

export interface ProjectAgentViewProps {
  detail: ProjectAgentDetailData
  instructions: PlaceInstructionsData | null
  now: Date
  renderAvatar: RenderAgentAvatar
  profileOf?: (agentId: string, children: ReactNode) => ReactNode
  modelLabel: (id: string, runtime: string) => string
  /** Absent where the person may not start a conversation. */
  onStartConversation?: () => void
  /** Absent where the person may not add a task. */
  onAddTask?: (title: string) => Promise<void>
  onMoreTaskDetails: (title: string) => void
  onBack: () => void
  /** The view this goes back to: "Agents", or "Members" where agents are one part of a project's members. */
  backLabel?: string
  onOpenTasks: () => void
  onOpenRuns: () => void
  onOpenPlace: () => void
  onOpenFile: (path: string) => void
  /** Permissions here (the permissions view, given by hq); every member sees it, the project's admins change it. */
  permissionsHere?: ReactNode
  /** The part of the agent to scroll to on opening: `&focus=permissions` or `&focus=tasks`. */
  focus?: string | null
  /** Present for the project's admins. */
  onEdit?: () => void
  onRemove?: () => void
  /** Names of the teams that bring the agent here when it is here only through them: it is removed through the team (adr-0103). */
  onlyThroughTeams?: string[]
}

function runLine(run: RecentRunData, now: Date): string {
  const kind = run.kind === 'task' ? 'Task' : 'Conversation'
  const at = run.startedAt ?? run.createdAt
  const took = run.startedAt && run.endedAt ? ` · ${sinceText(run.startedAt, new Date(run.endedAt))}` : ''
  return `${kind} · ${whenText(at, now)}${took} · ${run.status.toLowerCase()}`
}

/** An agent opened inside the Agents tool: what it is doing here, what is set for it, and how to reach it. */
export function ProjectAgentView(p: ProjectAgentViewProps) {
  const { detail, now } = p
  const { agent } = detail
  const [adding, setAdding] = useState(false)
  const profile = p.profileOf ?? ((_id: string, children: ReactNode) => children)
  const tasksRef = useRef<HTMLDivElement>(null)
  const permissionsRef = useRef<HTMLDivElement>(null)
  const focus = p.focus
  const hasPermissions = p.permissionsHere !== undefined
  useEffect(() => {
    const target = focus === 'tasks' ? tasksRef.current : focus === 'permissions' ? permissionsRef.current : null
    target?.scrollIntoView?.({ block: 'start' })
  }, [focus, hasPermissions])
  return (
    <div className="pb-6">
      <ViewHeaderRow><PanelHeaderContent back={p.backLabel ?? 'Agents'} onBack={p.onBack} title={agent.name} /></ViewHeaderRow>
      <div className="flex items-center gap-3 px-4 pt-4">
        {profile(agent.id, <span className="shrink-0">{p.renderAvatar(agent, 'lg')}</span>)}
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-text-primary">{profile(agent.id, <span>{agent.name}</span>)}</p>
          <p className="truncate text-small text-text-muted">{agent.role ? `${agent.role} · ` : ''}@{agent.handle}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {p.onStartConversation && <button type="button" className={TASK_BUTTON_PRIMARY} onClick={p.onStartConversation}>Start a conversation</button>}
        {p.onAddTask && <button type="button" className={TASK_BUTTON} onClick={() => setAdding(v => !v)}>Give it a task</button>}
      </div>
      {adding && p.onAddTask && (
        <NewTaskRow onAdd={p.onAddTask} onMoreDetails={p.onMoreTaskDetails} onClose={() => setAdding(false)} />
      )}

      <Section title="Now">
        {detail.nowItems.length === 0
          ? <p className="text-small text-text-muted">Nothing needs it or is running here.</p>
          : <ul className="space-y-1">{detail.nowItems.map(i => (
            <li key={i.taskId} className="text-small">
              <span className="mr-1.5 font-mono text-micro text-text-muted">{i.key}</span>
              <span className="text-text-primary">{i.title}</span>
              <span className={`block ${i.kind === 'needsYou' ? 'text-warning' : 'text-success'}`}>{nowItemLine(i, now)}</span>
            </li>
          ))}</ul>}
      </Section>

      <Section title="Coming up">
        {detail.comingUp.length === 0
          ? <p className="text-small text-text-muted">Nothing is set to start.</p>
          : <ul className="space-y-1">{detail.comingUp.map(i => (
            <li key={`${i.kind}-${i.kind === 'task' ? i.taskId : i.routineId}-${i.at}`} className="text-small">
              {i.kind === 'task' && <span className="mr-1.5 font-mono text-micro text-text-muted">{i.key}</span>}
              <span className="text-text-primary">{i.title}</span>
              <span className="block text-text-muted">{comingUpLine(i, now)}</span>
            </li>
          ))}</ul>}
      </Section>

      <div ref={tasksRef} className="scroll-mt-12">
        <Section title="Its tasks here" action={<LinkButton onClick={p.onOpenTasks}>Open in Tasks</LinkButton>}>
          <p className="text-small text-text-secondary">{tasksLine(detail.tasks)}</p>
        </Section>
      </div>

      <ProjectAgentInThisProject detail={detail} modelLabel={p.modelLabel} onEdit={detail.canManage ? p.onEdit : undefined} />
      {p.permissionsHere !== undefined && <div ref={permissionsRef} className="scroll-mt-12 px-4 pt-6">{p.permissionsHere}</div>}
      <ProjectAgentInstructions agentName={agent.name} instructions={p.instructions} onOpenFile={p.onOpenFile} />

      <Section title="Recent runs" action={<LinkButton onClick={p.onOpenRuns}>All in Runs</LinkButton>}>
        {detail.recentRuns.runs.length === 0
          ? <p className="text-small text-text-muted">No runs here yet.</p>
          : <ul className="space-y-1">{detail.recentRuns.runs.slice(0, 5).map(r => (
            <li key={r.id} className="text-small">
              <span className="text-text-primary">{r.taskKey ? `${r.taskKey} ` : ''}{r.title ?? 'Untitled'}</span>
              <span className="block text-text-muted">{runLine(r, now)}</span>
            </li>
          ))}</ul>}
      </Section>

      <div className="space-y-2 px-4 pt-4">
        <p><LinkButton onClick={p.onOpenPlace}>Its own page under Agents ›</LinkButton></p>
        {p.onlyThroughTeams && p.onlyThroughTeams.length > 0 && (
          <p className="text-small text-text-muted">Here through {p.onlyThroughTeams.join(', ')}. Change it in the team.</p>
        )}
        {detail.canManage && p.onRemove && !p.onlyThroughTeams?.length && (
          <p><button type="button" onClick={p.onRemove} className="rounded text-small text-danger hover:underline">Remove from this project</button></p>
        )}
      </div>
    </div>
  )
}
