import { useQuery } from 'wasp/client/operations'
import { getProjectActiveRuns } from 'wasp/client/operations'
import { Bot } from 'lucide-react'
import { timeAgo } from '@agenthix/ui/agents'
import { useShellPanels } from '../../shared/context/useShellPanels'
import { useMarkedItem } from '../../shared/hooks/useMarkedItem'
import { ProjectRunControls } from './ProjectRunControls'

// Mirrors activeRuns.ts's `ActiveRunView` (hq/src/sessions/activeRuns.ts) —
// cast at the boundary, as pages do for a Wasp query's inferred shape.
type StartedBy =
  | { kind: 'person'; userId: string; name: string }
  | { kind: 'task'; taskId: string; title: string }
type RunLocation =
  | { kind: 'workspace'; workspaceId: string; name: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'files' }
export interface ActiveRunRow {
  runId: string
  agentId: string
  agentName: string
  status: 'PENDING' | 'RUNNING'
  startedBy: StartedBy
  location: RunLocation
  since: string
  sharesWorkspace: boolean
}

function startedByText(startedBy: StartedBy): string {
  return startedBy.kind === 'person' ? startedBy.name : `task "${startedBy.title}"`
}

function locationText(location: RunLocation): string {
  switch (location.kind) {
    case 'workspace': return `workspace ${location.name}`
    case 'task': return 'its task folder'
    case 'files': return 'the project files'
  }
}

/**
 * The Runs tool (every screen reviewed spec §3): every chat and task run active
 * in this project right now — its agent, who or what started it, where it is
 * working, and since when (person-scoped execution spec §3, ADR-0077). Never a
 * run's content: no message text, no conversation title.
 *
 * `getProjectActiveRuns` applies the same membership rule as `getProject`. An
 * unreachable site is said plainly rather than read as "nothing running". The
 * person's own runs everywhere, with their controls, are in the Runs panel.
 */
export function ProjectRunsTool({ projectId, isProjectAdmin }: { projectId: string; isProjectAdmin?: boolean }) {
  const { data, error, isLoading } = useQuery(getProjectActiveRuns, { projectId })
  const { openRuns } = useShellPanels()
  const runs = data as ActiveRunRow[] | undefined
  const { markOf } = useMarkedItem('run')

  return (
    <div className="p-4 space-y-3">
      {/* Chat keeps its controls under the tools panel's group, so it passes none here. */}
      {isProjectAdmin !== undefined && <ProjectRunControls projectId={projectId} isProjectAdmin={isProjectAdmin} />}
      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-2.5 text-small text-danger">{error.message}</div>
      )}
      {!error && !isLoading && (!runs || runs.length === 0) && (
        <p className="text-small text-text-muted">Nothing is running in this project.</p>
      )}
      {runs && runs.length > 0 && (
        <div className="space-y-1.5">
          {runs.map(run => {
            const mark = markOf(run.runId)
            return (
            <div key={run.runId} {...mark} className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-body py-1 ${mark.className ?? ''}`}>
              <Bot size={14} className="text-accent shrink-0" />
              <span className="font-medium text-text-primary">{run.agentName}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-secondary">{startedByText(run.startedBy)}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-secondary">in {locationText(run.location)}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">since {timeAgo(run.since)}</span>
              {run.sharesWorkspace && (
                <span
                  title="Another active run is working in the same workspace"
                  className="px-1.5 py-0.5 rounded-full text-micro font-medium bg-warning/15 text-warning"
                >
                  shares this workspace
                </span>
              )}
            </div>
            )
          })}
        </div>
      )}
      <button type="button" onClick={openRuns} className="text-small text-accent hover:text-accent-hover">
        Open the Runs panel
      </button>
    </div>
  )
}
