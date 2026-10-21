/**
 * What narrows the Runs screen's list (spec §6): the person's relation to the run, when, where, which agent, how it
 * ended, and a search. Pure; `screenSessions.ts` turns the first four into the sessions asked about, and
 * `runMatches` is applied to the runs the sites return.
 */
import { runFeedKey, type RunRow } from '@agenthix/core'
import { RUN_ENDED, RUN_RELATION, RUN_WHEN, type RunsFilters } from './screenTypes'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_MS = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS } as const
const SEARCH_MAX = 100

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : undefined

/** What the browser sent, kept to what is known: anything else is no narrowing, never an error. */
export function parseRunsFilters(raw: unknown): RunsFilters {
  const r = (raw ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, SEARCH_MAX) : undefined)
  return {
    relation: oneOf(RUN_RELATION, r.relation),
    when: oneOf(RUN_WHEN, r.when),
    place: text(r.place),
    agentId: text(r.agentId),
    ended: oneOf(RUN_ENDED, r.ended),
    search: text(r.search),
    conversationId: text(r.conversationId),
  }
}

/** Whether the filters narrow what a run's own record says (when, how it ended), as opposed to which sessions are asked. */
export function narrowsRuns(f: RunsFilters): boolean {
  return (!!f.when && f.when !== 'any') || (!!f.ended && f.ended !== 'any')
}

const STATUS_OF = { completed: ['COMPLETED'], failed: ['FAILED'], stopped: ['CANCELLED'] } as const

/** Whether a run passes the filters that read its own record. */
export function runMatches(run: RunRow, f: RunsFilters, now: number = Date.now()): boolean {
  if (f.when && f.when !== 'any' && new Date(runFeedKey(run)).getTime() < now - WINDOW_MS[f.when]) return false
  if (f.ended && f.ended !== 'any' && !(STATUS_OF[f.ended] as readonly string[]).includes(run.status)) return false
  return true
}

/** "WEB-27" as a task key: the project's key and the task's number. */
export function taskKeyOf(search: string): { key: string; number: number } | null {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(search.trim())
  return m ? { key: m[1].toUpperCase(), number: Number(m[2]) } : null
}
