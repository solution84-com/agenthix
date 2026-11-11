import { useQuery, getWorkflowRuns } from 'wasp/client/operations'
import { EmptyState, FOCUS_RING_INSET } from '@agenthix/ui/primitives'
import { Play } from 'lucide-react'
import { formatDuration, RUN_WORDS, whenWords } from '../pages/workflowWords'
import { useBackgroundRead } from '@agenthix/ui/attention'

/** This workflow's runs, newest first; each opens the run. */
export function RunsTab({ workflowId, onOpen }: { workflowId: string; onOpen: (runId: string) => void }) {
  const query = useQuery(getWorkflowRuns, { workflowId })
  const { data } = query
  const read = useBackgroundRead(query, { what: 'The runs' })
  if (read.failedWithoutData) return read.nudge
  if (!data) return <p className="text-small text-text-muted">Loading…</p>
  if (data.length === 0) return <EmptyState icon={Play} variant="inline" title="No runs yet" hint="Press Run to start one." />
  return (
    <>
      {read.nudge}
      <ul className="divide-y divide-border-subtle rounded-xl border border-border bg-card" aria-label="Runs">
        {data.map((r) => (
          <li key={r.id} data-testid="run-row">
            <button type="button" onClick={() => onOpen(r.id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-text-primary">{RUN_WORDS[r.state] ?? r.state} · version {r.version}</span>
                <span className="block text-small text-text-secondary">{whenWords(r.startedAt ?? r.createdAt)}{r.agentId ? ' · started by an agent' : ''}</span>
              </span>
              <span className="text-small text-text-muted">{formatDuration(r.durationMs)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
