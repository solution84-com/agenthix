import { useCallback, useMemo, useState } from 'react'
import { useQuery, getMyRuns } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { PanelGroupHeading, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { silencesOfRows, unansweredSitesCopy } from '../../siteSilence'
import type { MyRun } from '../../../runs/queries'
import { RunRow } from './RunRow'
import { RUN_FILTERS, RUN_GROUPS, groupRuns, type RunFilter } from './runsListLogic'

/**
 * The person's runs under their filters, in four groups: waiting for them, running, queued, finished.
 * The Runs panel and the Runs screen both show it; a place passes its project's key to show only the
 * runs of that project. `onOpenRequest` opens a waiting tool request on a tap; without it a tap opens the run.
 */
export function RunsListView({ onOpen, onOpenRequest, projectKey }: {
  onOpen: (run: MyRun) => void
  onOpenRequest?: (taskKey: string) => void
  projectKey?: string
}) {
  const { data, isLoading, refetch } = useQuery(getMyRuns)
  const [filter, setFilter] = useState<RunFilter>('all')

  const onRunStatus = useCallback(() => { refetch() }, [refetch])
  useSocketListener('agentRunStatus', onRunStatus)

  const allRuns = (data ?? []) as MyRun[]
  const runs = useMemo(() => (projectKey ? allRuns.filter(r => r.place.projectKey === projectKey) : allRuns), [allRuns, projectKey])
  const groups = useMemo(() => groupRuns(runs, filter), [runs, filter])
  const siteCopy = unansweredSitesCopy(silencesOfRows(runs), "these runs' latest state")
  const empty = RUN_GROUPS.every(g => groups[g.id].length === 0)

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div role="group" aria-label="Show runs" className="flex gap-1 px-3 py-2 border-b border-border-subtle shrink-0 overflow-x-auto">
        {RUN_FILTERS.map(f => (
          <button
            key={f.id}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-micro font-medium transition-colors cursor-pointer ${
              filter === f.id ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <UnansweredSitesNotice copy={siteCopy} className="m-2 shrink-0" />

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {isLoading ? (
          <p className="text-small text-text-muted text-center py-8">Loading…</p>
        ) : empty ? (
          <div className="flex flex-col items-center gap-2 text-center px-6 py-10">
            <p className="text-small text-text-muted">No runs</p>
            <p className="text-micro text-text-muted">Runs you started, or that are done for you, appear here</p>
          </div>
        ) : (
          RUN_GROUPS.filter(g => groups[g.id].length > 0).map(g => (
            <section key={g.id} aria-label={g.label}>
              <PanelGroupHeading label={g.label} count={groups[g.id].length} tone={g.tone} />
              <ul>{groups[g.id].map(run => <RunRow key={run.key} run={run} onOpen={onOpen} onOpenRequest={onOpenRequest} />)}</ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
