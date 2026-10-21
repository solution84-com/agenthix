/**
 * One organisation's run figures, folded from however many sites answered.
 *
 * Runs live on the Execution Sites and an organisation can run several, so
 * every run figure hq shows is a sum rather than a reading. Both dashboard
 * reads — the snapshot and the aggregate stats query — fold the same way, and
 * they do it here rather than each keeping its own arithmetic: two folds is
 * how the snapshot and the stats page come to disagree about the same number.
 *
 * `perAgent` merges **by `agentId`**, never concatenates. An agent is an
 * organisation's, not a site's, and the same agent runs on more than one of
 * them — concatenating would list it twice, each row a fraction of its real
 * total, and the dashboard's "top agents" would rank the fractions.
 *
 * Nothing here is kept. The fold is computed from the answers in hand each
 * time it is asked for, because a copy of a site's totals on hq would be the
 * second master this design refuses everywhere else.
 */
import type { RunStatsResult, SiteAnswer } from '@agenthix/core'

const EMPTY_RUN_STATS: RunStatsResult = {
  totalRuns: 0,
  completedRuns: 0,
  failedRuns: 0,
  runningRuns: 0,
  totalTokens: 0,
  perAgent: [],
}

export function foldRunStats(answers: SiteAnswer<RunStatsResult>[]): RunStatsResult {
  const perAgent = new Map<string, { agentId: string; runCount: number; totalTokens: number }>()
  const folded: RunStatsResult = { ...EMPTY_RUN_STATS, perAgent: [] }

  for (const { value } of answers) {
    folded.totalRuns += value.totalRuns
    folded.completedRuns += value.completedRuns
    folded.failedRuns += value.failedRuns
    folded.runningRuns += value.runningRuns
    folded.totalTokens += value.totalTokens
    for (const row of value.perAgent) {
      const merged = perAgent.get(row.agentId)
      if (merged) {
        merged.runCount += row.runCount
        merged.totalTokens += row.totalTokens
      } else {
        perAgent.set(row.agentId, { agentId: row.agentId, runCount: row.runCount, totalTokens: row.totalTokens })
      }
    }
  }

  folded.perAgent = [...perAgent.values()]
  return folded
}
