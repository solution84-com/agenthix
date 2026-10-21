/**
 * One page of the Runs screen (spec §6): the person's runs, newest first, 25 at a time. Each page is one request per
 * site, for the runs of all the sessions the person's list covers (`run.listPage` with `sessionIds`), never one per
 * conversation or task. A page that the filters leave short is read on, a few times, so a narrow filter does not make
 * the person press Older runs › on an empty page.
 */
import { runFeedKey, type RunRow } from '@agenthix/core'
import { readMergedRunFeed } from '../sessions/mergedRunFeed'
import { outcomeText, riskyCallCount, runGroup } from './runsView'
import { narrowsRuns, parseRunsFilters, runMatches } from './screenFilters'
import { queuedForScreen, sessionsForScreen, type SessionFacts } from './screenSessions'
import type { RunListItem, RunsPageArgs, RunsPageResult } from './screenTypes'

export const RUNS_PAGE_SIZE = 25
/** How many reads one page may take to fill itself when the filters drop most of what the sites return. */
const MAX_READS = 4

export function runListItem(run: RunRow, facts: SessionFacts): RunListItem {
  const group = runGroup(run, facts.taskRunState)
  return {
    runId: run.id, sessionId: run.sessionId, group, kind: facts.kind, title: facts.title, ref: facts.ref, href: facts.href,
    place: facts.place, agent: facts.agent,
    outcome: group === 'waiting' ? 'wants approval' : group === 'running' ? null : outcomeText(run),
    riskyCalls: riskyCallCount(run.auditSummary), wait: null, startedByText: facts.startedByText,
    startedAt: run.startedAt, endedAt: run.endedAt, at: runFeedKey(run),
  }
}

export async function readRunsPage(me: string, args: RunsPageArgs): Promise<RunsPageResult> {
  const filters = parseRunsFilters(args)
  const first = !args.cursor
  const [{ facts, sessionIds }, queued] = await Promise.all([
    sessionsForScreen(me, filters),
    first && !narrowsRuns(filters) ? queuedForScreen(me, filters) : Promise.resolve([]),
  ])

  const items: RunListItem[] = queued.map((q) => ({
    runId: null, sessionId: null, group: 'queued', kind: q.kind, title: q.title, ref: q.ref, href: q.href, place: q.place,
    agent: q.agent, outcome: null, riskyCalls: null, wait: q.wait, startedByText: q.startedByText,
    startedAt: null, endedAt: null, at: q.at,
  }))
  if (sessionIds.length === 0) return { runs: items, nextCursor: null, unanswered: [] }

  let cursor = args.cursor
  let unanswered: RunsPageResult['unanswered'] = []
  const runs: RunListItem[] = []
  for (let read = 0; read < MAX_READS && runs.length < RUNS_PAGE_SIZE; read++) {
    const feed = await readMergedRunFeed({
      limit: RUNS_PAGE_SIZE - runs.length,
      cursor,
      filter: { sessionIds },
      // Every run asked about is of a session in `facts`; the filters that read the run itself are applied before the page is cut.
      visible: async (rows) => rows.filter((run) => facts.has(run.sessionId) && runMatches(run, filters)),
    })
    for (const run of feed.runs) runs.push(runListItem(run, facts.get(run.sessionId)!))
    unanswered = feed.unanswered
    cursor = feed.nextCursor ?? undefined
    if (!cursor) break
  }
  return { runs: [...items, ...runs], nextCursor: cursor ?? null, unanswered }
}
