import { useCallback, useMemo, useState } from 'react'
import { useQuery, getMyRuns } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { EmptyState, FilterTabs, PanelGroupHeading, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { silencesOfRows, unansweredSitesCopy } from '../../siteSilence'
import type { MyRun } from '../../../runs/queries'
import { RunRow } from './RunRow'
import { PANEL_RUN_GROUPS as RUN_GROUPS, RUN_FILTERS, groupRuns, type RunFilter } from './runsListLogic'
import { localMidnight } from '../../utils/localMidnight'

/**
 * The person's runs under their filters, in the Workroom's four groups: needs you, running, waiting, finished today.
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
  const today = localMidnight()
  const groups = useMemo(() => groupRuns(runs, filter, today), [runs, filter, today])
  const siteCopy = unansweredSitesCopy(silencesOfRows(runs), "these runs' latest state")
  const empty = RUN_GROUPS.every(g => groups[g.id].length === 0)

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <FilterTabs
        label="Show runs" value={filter} onChange={setFilter}
        tabs={RUN_FILTERS.map(f => ({ value: f.id, label: f.label }))}
        className="shrink-0 border-b border-border-subtle px-3 py-2"
      />

      <UnansweredSitesNotice copy={siteCopy} className="m-2 shrink-0" />

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {isLoading ? (
          <p className="text-small text-text-muted text-center py-8">Loading…</p>
        ) : empty ? (
          <div className="px-4 pt-4">
            <EmptyState variant="inline" title="Nothing is running for you. Runs you start, and runs on your behalf (a task you own, a routine you last changed), show here." />
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
