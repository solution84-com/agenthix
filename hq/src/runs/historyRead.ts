/**
 * One page of the Runs history. The newest runs of the scope's sessions are read in one request per site, up to
 * `HISTORY_RUN_WINDOW`; the tabs' counts, the sort and the page are then made here, so a sort by cost or by how long a
 * run took, and "1–20 of 124", hold across every site. Who may see which session is decided in `historySessions.ts`,
 * never by a site.
 */
import { prisma } from 'wasp/server'
import { RUN_SESSION_IDS_MAX, type RunRow } from '@agenthix/core'
import { readMergedRunFeed } from '../sessions/mergedRunFeed'
import { todayWindow } from '../projects/workroom/workroomRules'
import {
  costOf, countRows, dispatchFactsOf, matchesSearch, matchesStarter, matchesWhose, pageOf, parseHistoryArgs, placeRun,
  sortRows, startedByWords, tookMs, whoseOf, withinWhen, type HistoryFilters,
} from './historyRules'
import { historySessions, type HistorySession } from './historySessions'
import { HISTORY_PAGE_SIZE, type RunHistoryArgs, type RunHistoryResult, type RunHistoryRow } from './historyTypes'

/** The most runs one read of the history covers, newest first; a scope with more counts and sorts the newest this many. */
export const HISTORY_RUN_WINDOW = 500

type Built = RunHistoryRow & { whose: ReturnType<typeof whoseOf>; failedNeed: boolean; ask: boolean }

function rowOf(run: RunRow, s: HistorySession, number: number | null, me: string, names: Map<string, string>, now: Date): Built {
  const placed = placeRun(run, s.task)
  const whose = whoseOf(dispatchFactsOf(run.metadata), s.personId)
  const latest = s.task?.latestRunId === run.id
  return {
    runId: run.id, sessionId: run.sessionId, kind: s.kind, taskKey: s.taskKey, taskId: s.taskId, number,
    title: s.title, href: s.href, openable: s.openable, place: s.place, agent: s.agent,
    group: placed.group, ring: placed.ring,
    // A reply's failure is said in its conversation; another person's reply carries nothing of its content.
    note: s.kind === 'reply' && !s.openable ? null : placed.note,
    tookMs: tookMs(run, now), cost: costOf(run),
    startedBy: startedByWords(whose, s.kind, me, (id) => names.get(id) ?? null, latest ? s.starterAgent : null),
    at: run.startedAt ?? run.createdAt,
    whose, failedNeed: placed.failedNeed, ask: placed.ask,
  }
}

function strip({ whose: _w, failedNeed: _f, ask: _a, ...row }: Built): RunHistoryRow {
  return row
}

async function numbersOf(runIds: string[]): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map()
  const rows = await prisma.runResult.findMany({ where: { runId: { in: runIds }, number: { not: null } }, select: { runId: true, number: true } })
  return new Map(rows.map(r => [r.runId, r.number as number]))
}

export async function readRunHistory(me: string, args: RunHistoryArgs | undefined, now = new Date()): Promise<RunHistoryResult> {
  const f: HistoryFilters = parseHistoryArgs(args)
  const scope = await historySessions(me, f)
  const sessionIds = [...scope.sessions.keys()].slice(0, RUN_SESSION_IDS_MAX)
  const empty: RunHistoryResult = {
    rows: [], counts: { all: 0, running: 0, waiting: 0, needs: 0, finished: 0 }, needs: { asks: 0, failed: 0, routines: 0 },
    total: 0, page: 1, pageSize: HISTORY_PAGE_SIZE, capped: false, nothingYet: true, names: scope.named, unanswered: [],
  }
  if (sessionIds.length === 0) return empty

  const feed = await readMergedRunFeed({
    limit: HISTORY_RUN_WINDOW,
    filter: { sessionIds },
    visible: async (rows) => rows.filter(r => scope.sessions.has(r.sessionId)),
  })
  const numbers = await numbersOf(feed.runs.filter(r => scope.sessions.get(r.sessionId)?.kind === 'task').map(r => r.id))
  const today = todayWindow(f.todayFrom, now)
  const all = feed.runs.map(run => rowOf(run, scope.sessions.get(run.sessionId)!, numbers.get(run.id) ?? null, me, scope.names, now))

  const narrowed = all.filter(r =>
    withinWhen(r.at, f.when, today, now)
    && matchesSearch(r, f.search)
    && matchesStarter(r.whose, f.startedBy, me)
    && (f.projectKey || f.conversationId ? true : matchesWhose(r.whose, f.whose, me)))
  const counts = countRows(narrowed)
  const onTab = f.state === 'all' ? narrowed : narrowed.filter(r => r.group === f.state)
  const page = pageOf(sortRows(onTab, f.sort), f.page)
  const needing = narrowed.filter(r => r.group === 'needs')

  return {
    rows: page.rows.map(strip),
    counts,
    needs: { asks: needing.filter(r => r.ask).length, failed: needing.filter(r => r.failedNeed).length, routines: needing.filter(r => r.kind === 'routine').length },
    total: onTab.length,
    page: page.page,
    pageSize: HISTORY_PAGE_SIZE,
    capped: feed.nextCursor !== null,
    nothingYet: all.length === 0 && feed.unanswered.length === 0,
    names: scope.named,
    unanswered: feed.unanswered,
  }
}
