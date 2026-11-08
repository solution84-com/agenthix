import { useQuery, getRunPage } from 'wasp/client/operations'
import type { RunPageView } from '../runPageTypes'

export type RunLabel = { crumb: string; title: string; under: string | null }

/**
 * How a run is named where it is open (the Runs design, *A run's own view*): the breadcrumb's end "WEB-12 · Run 2", and
 * on a phone the title "Run 2" with the task's title under it. "A run" until it is read, "A reply" for a conversation's.
 */
export function runLabelOf(view: RunPageView | null | undefined): RunLabel {
  if (!view) return { crumb: 'A run', title: 'A run', under: null }
  if (view.kind !== 'task') return { crumb: 'A reply', title: 'A reply', under: view.detail.title || null }
  const run = view.number ? `Run ${view.number}` : null
  return {
    crumb: [view.detail.ref, run].filter(Boolean).join(' · ') || 'A run',
    title: run ?? view.detail.ref ?? 'A run',
    under: view.detail.title || null,
  }
}

/** The open run's name, read with the run's page; null while no run is open. */
export function useRunLabel(runId: string | null, sessionId: string | null): RunLabel | null {
  const { data } = useQuery(getRunPage, { runId: runId ?? '', ...(sessionId ? { sessionId } : {}) }, { enabled: !!runId })
  return runId ? runLabelOf(data as RunPageView | null | undefined) : null
}
