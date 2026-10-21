import { plainReason, runWaitText } from '@agenthix/ui/tasks'
import type { MyRun } from '../../../runs/queries'
import { FAILED_PREFIX } from '../../../runs/runsView'

export type RunFilter = 'all' | 'started' | 'behalf'

export const RUN_FILTERS: { id: RunFilter; label: string }[] = [
  { id: 'all', label: 'All of mine' },
  { id: 'started', label: 'Started by me' },
  { id: 'behalf', label: 'On my behalf' },
]

export function matchesFilter(run: MyRun, filter: RunFilter): boolean {
  if (filter === 'started') return run.startedByMe
  if (filter === 'behalf') return run.onMyBehalf
  return true
}

export const RUN_GROUPS: { id: MyRun['group']; label: string; tone?: 'warning' | 'success' }[] = [
  { id: 'waiting', label: 'Waiting for you', tone: 'warning' },
  { id: 'running', label: 'Running', tone: 'success' },
  { id: 'queued', label: 'Queued' },
  { id: 'finished', label: 'Finished' },
]

/** Runs under a filter, split into the four groups, each newest first (queued: in line order). */
export function groupRuns(runs: MyRun[], filter: RunFilter): Record<MyRun['group'], MyRun[]> {
  const out: Record<MyRun['group'], MyRun[]> = { waiting: [], running: [], queued: [], finished: [] }
  for (const r of runs) if (matchesFilter(r, filter)) out[r.group].push(r)
  for (const g of ['waiting', 'running', 'finished'] as const) out[g].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out
}

/** What a run's second line ends with: why a queued run waits, else its state. */
export function runState(run: MyRun): string | null {
  const state = run.group === 'queued' ? runWaitText(run.wait) ?? run.state : run.state
  if (!state) return null
  // A stored reason (a blocked task's, a queued one's, a failed one's) reads in plain words.
  if (state.startsWith(FAILED_PREFIX)) return `${FAILED_PREFIX}${plainReason(state.slice(FAILED_PREFIX.length))}`
  return plainReason(state)
}

/** Line 2 before its state: the agent, the place, and "conversation" for a conversation in a project. */
export function runPlace(run: MyRun): string {
  return [
    run.agent?.name ?? 'No agent yet',
    run.place.name,
    run.kind === 'conversation' && run.place.projectKey ? 'conversation' : null,
  ].filter(Boolean).join(' · ')
}
