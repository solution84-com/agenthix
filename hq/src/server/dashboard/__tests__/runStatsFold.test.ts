import { describe, it, expect } from 'vitest'
import type { RunStatsResult, SiteAnswer } from '@agenthix/core'
import { foldRunStats } from '../runStatsFold'

// Tested directly, not only through its two callers. The reason the fold was
// extracted is that two callers each folding for themselves is how the
// snapshot and the statistics page come to disagree about one number — and a
// test that reaches it only through a caller cannot see that divergence
// starting.

const stats = (over: Partial<RunStatsResult> = {}): RunStatsResult => ({
  totalRuns: 0, completedRuns: 0, failedRuns: 0, runningRuns: 0, totalTokens: 0, perAgent: [], ...over,
})

const from = (...values: RunStatsResult[]): SiteAnswer<RunStatsResult>[] =>
  values.map((value, i) => ({ siteId: `site-${i}`, value }))

describe('folding run statistics across sites', () => {
  it('answers zero for no answers, with an empty breakdown', () => {
    expect(foldRunStats([])).toEqual({
      totalRuns: 0, completedRuns: 0, failedRuns: 0, runningRuns: 0, totalTokens: 0, perAgent: [],
    })
  })

  it('sums every scalar total', () => {
    const folded = foldRunStats(
      from(
        stats({ totalRuns: 3, completedRuns: 2, failedRuns: 1, runningRuns: 0, totalTokens: 100 }),
        stats({ totalRuns: 4, completedRuns: 4, failedRuns: 0, runningRuns: 1, totalTokens: 50 }),
      ),
    )

    expect(folded).toMatchObject({
      totalRuns: 7, completedRuns: 6, failedRuns: 1, runningRuns: 1, totalTokens: 150,
    })
  })

  it('merges an agent that runs on more than one site into one row', () => {
    const folded = foldRunStats(
      from(
        stats({ perAgent: [{ agentId: 'x', runCount: 3, totalTokens: 100 }] }),
        stats({ perAgent: [{ agentId: 'x', runCount: 4, totalTokens: 50 }] }),
      ),
    )

    expect(folded.perAgent).toEqual([{ agentId: 'x', runCount: 7, totalTokens: 150 }])
  })

  it('keeps agents that run on only one site apart', () => {
    const folded = foldRunStats(
      from(
        stats({ perAgent: [{ agentId: 'x', runCount: 1, totalTokens: 10 }] }),
        stats({ perAgent: [{ agentId: 'y', runCount: 2, totalTokens: 20 }] }),
      ),
    )

    expect(folded.perAgent).toEqual([
      { agentId: 'x', runCount: 1, totalTokens: 10 },
      { agentId: 'y', runCount: 2, totalTokens: 20 },
    ])
  })

  it('orders the breakdown by where each agent was first seen', () => {
    const folded = foldRunStats(
      from(
        stats({ perAgent: [{ agentId: 'b', runCount: 1, totalTokens: 1 }] }),
        stats({
          perAgent: [
            { agentId: 'a', runCount: 1, totalTokens: 1 },
            { agentId: 'b', runCount: 1, totalTokens: 1 },
          ],
        }),
      ),
    )

    expect(folded.perAgent.map((p) => p.agentId)).toEqual(['b', 'a'])
  })

  it('does not mutate the answers it was given', () => {
    const one = stats({ totalRuns: 1, perAgent: [{ agentId: 'x', runCount: 1, totalTokens: 5 }] })
    const two = stats({ totalRuns: 2, perAgent: [{ agentId: 'x', runCount: 2, totalTokens: 7 }] })

    foldRunStats(from(one, two))

    expect(one.totalRuns).toBe(1)
    expect(one.perAgent).toEqual([{ agentId: 'x', runCount: 1, totalTokens: 5 }])
  })

  it('folds one site to itself', () => {
    const only = stats({ totalRuns: 5, totalTokens: 9, perAgent: [{ agentId: 'x', runCount: 5, totalTokens: 9 }] })

    expect(foldRunStats(from(only))).toEqual(only)
  })
})
