import { nowLine, tasksLine } from '../agents/agentNowLines'
import { LinkButton, NowLabel, type RenderAgentAvatar } from '../agents/ProjectAgentParts'
import type { InstructionFileData, ProjectAgentRowData } from '../agents/projectAgentTypes'
import { TASK_BUTTON } from '../tasks/TasksToolParts'
import { FOCUS_RING, CARD_CLICKABLE } from '../primitives/controlStyles'

/** The assignment a project's page lists; the Agents tool itself reads `ProjectAgentRowData`. */
export interface ProjectAgent {
  agentId: string
  agent: {
    id: string
    name: string
    handle?: string | null
  }
}

export interface ProjectAgentsListProps {
  agents: ProjectAgentRowData[]
  everyAgent: { file: InstructionFileData; skills: string[] } | null
  now: Date
  renderAvatar: RenderAgentAvatar
  /** The agent's models, as a line a person reads. */
  modelLine: (agentId: string) => string
  onOpenAgent: (agentId: string) => void
  onOpenFile: (path: string) => void
  /** Absent where the person may not assign agents. */
  onAssign?: () => void
  /** Drops the ＋ Assign row above the list, for a view that shows agents among other members. */
  hideHeader?: boolean
  /** The teams that bring an agent here (adr-0103), by name. */
  teamsOf?: (agentId: string) => string[]
}

/** The box naming what every agent in the project follows, opening in Files. */
function EveryAgentBox({ everyAgent, onOpenFile }: { everyAgent: NonNullable<ProjectAgentsListProps['everyAgent']>; onOpenFile: (path: string) => void }) {
  const { file, skills } = everyAgent
  return (
    <div className="mx-4 mt-4 space-y-1 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-small">
      <p className="font-medium text-text-primary">For every agent here</p>
      <p className="text-text-secondary">
        Instructions · <LinkButton onClick={() => onOpenFile(file.path)}>{file.path}</LinkButton>
        {file.text === null && <span className="text-text-muted"> (none yet)</span>}
      </p>
      <p className="text-text-secondary">
        Skills · {skills.length === 0
          ? <span className="text-text-muted">none yet</span>
          : skills.map((s, i) => (
            <span key={s}>{i > 0 && ' · '}<LinkButton onClick={() => onOpenFile(`.agents/skills/${s}`)}>{s}</LinkButton></span>
          ))}
      </p>
    </div>
  )
}

/**
 * The Agents tool's list (every screen reviewed spec §3): what every agent here follows, then each agent as it
 * works in this project. The whole row opens the agent; the profile card is for a name or picture elsewhere. An assignment grants an agent nothing (ADR-0062), so this is availability, never entitlement.
 */
export function ProjectAgentsList({ agents, everyAgent, now, renderAvatar, modelLine, onOpenAgent, onOpenFile, onAssign, hideHeader, teamsOf }: ProjectAgentsListProps) {
  return (
    <div className="pb-6">
      {!hideHeader && (
        <div className="flex items-center justify-end px-4 pt-4">
          {onAssign && <button type="button" className={TASK_BUTTON} onClick={onAssign}>＋ Assign</button>}
        </div>
      )}
      {everyAgent && <EveryAgentBox everyAgent={everyAgent} onOpenFile={onOpenFile} />}
      {agents.length === 0 ? (
        <p className="px-4 pt-4 text-small text-text-muted">No agents assigned yet.</p>
      ) : (
        <ul className="space-y-2 px-4 pt-4">
          {agents.map(row => {
            const line = nowLine(row.now, now)
            return (
              <li
                key={row.agent.id} onClick={() => onOpenAgent(row.agent.id)}
                className={`cursor-pointer rounded-xl border bg-card px-4 py-3 ${CARD_CLICKABLE}`}
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0">{renderAvatar(row.agent, 'lg')}</span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button" aria-label={`Open ${row.agent.name}`}
                        className={`min-w-0 truncate rounded text-left text-body font-medium text-text-primary hover:underline ${FOCUS_RING}`}
                      >
                        {row.agent.name}
                        {row.agent.role && <span className="ml-2 text-small font-normal text-text-muted">{row.agent.role}</span>}
                      </button>
                      {teamsOf?.(row.agent.id).map(name => (
                        <span key={name} className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-micro font-medium text-text-secondary">{name}</span>
                      ))}
                      {row.isDefault && <span className="shrink-0 text-micro font-medium text-text-muted">Default</span>}
                      {row.now.needsYouCount > 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-warning/20 px-2 text-micro font-medium text-warning">
                          {row.now.needsYouCount} {row.now.needsYouCount === 1 ? 'needs' : 'need'} you
                        </span>
                      )}
                    </div>
                    <p className="text-small text-text-secondary">
                      <NowLabel tone={line.tone}>{line.label}</NowLabel>
                      {line.detail && <> · {line.detail}</>}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-small text-text-muted">
                      <span>{tasksLine(row.tasks)}</span>
                      <span>
                        {modelLine(row.agent.id)}
                        {row.narrowed && <span className="ml-1 rounded-md bg-chip px-1.5 text-micro font-medium text-text-secondary">narrowed here</span>}
                      </span>
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
