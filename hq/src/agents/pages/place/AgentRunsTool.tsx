import { timeAgo } from '@agenthix/ui/agents'
import { UnansweredSitesNotice, FOCUS_RING_INSET, ROW_ITEM } from '@agenthix/ui/primitives'
import { unansweredSitesCopy } from '../../../shared/siteSilence'
import { useShellPanels } from '../../../shared/context/useShellPanels'
import type { RecentRuns } from '../../agentRecentRuns'

const STATUS: Record<string, string> = { PENDING: 'Starting', RUNNING: 'Running', COMPLETED: 'Done', FAILED: 'Failed', CANCELLED: 'Stopped' }

/** Its recent runs on the person's behalf (spec §3); each opens in the Runs panel. */
export function AgentRunsTool({ recentRuns }: { recentRuns: RecentRuns }) {
  const { openRunsSession } = useShellPanels()
  return (
    <div className="p-4">
      <UnansweredSitesNotice copy={unansweredSitesCopy(recentRuns.unanswered, 'these runs')} className="mb-3" />
      {recentRuns.runs.length === 0 && recentRuns.unanswered.length === 0 && <p className="text-small text-text-muted">No runs for you yet.</p>}
      {recentRuns.runs.map((run) => (
        <button
          key={run.id}
          type="button"
          onClick={() => openRunsSession(run.sessionId)}
          className={`block w-full border-t border-border-subtle px-2 py-2 text-left first:border-t-0 ${ROW_ITEM} ${FOCUS_RING_INSET}`}
        >
          <div className="truncate text-body text-text-primary">
            {run.taskKey && <span className="font-mono text-small text-text-muted">{run.taskKey} </span>}
            {run.title || (run.kind === 'task' ? 'A task' : 'A conversation')}
          </div>
          <div className="text-small text-text-muted">{STATUS[run.status] ?? run.status} · {timeAgo(run.startedAt ?? run.createdAt)}</div>
          {run.failure && <div className="text-small text-text-muted" data-testid="agent-run-failure">{run.failure}</div>}
        </button>
      ))}
    </div>
  )
}
