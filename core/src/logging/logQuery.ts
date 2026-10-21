/**
 * Reading one service's log: newest first, filtered, a page at a time. The
 * same query reads HQ's own file and, over the control channel, a site's
 * (`protocol/siteDiagnostics.ts`), so both are checked by one parser.
 *
 * `levels` is `problems` (errors and warnings, what the screen starts at) or
 * `all`. A cursor is opaque to the caller: hand back `nextCursor` for the page
 * of older lines; null means there are none.
 */
import type { LogLevel, LogLine } from './logLine.js'

export type LogLevels = 'problems' | 'all'

export type LogQuery = {
  levels: LogLevels
  /** ISO; lines at or after it. */
  since: string | null
  /** ISO; lines before it. */
  until: string | null
  /** Matched without case against the message, the source and the fields. */
  search: string | null
  cursor: string | null
  limit: number
}

export type LogPage = {
  lines: LogLine[]
  nextCursor: string | null
}

export const LOG_PAGE_DEFAULT = 200
export const LOG_PAGE_MAX = 1000
const SEARCH_MAX = 200
const CURSOR_MAX = 100

function isoOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
}

/** A query off the wire or from a browser, with every field checked; anything missing takes its default. */
export function parseLogQuery(input: unknown): LogQuery {
  const q = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const limit = typeof q.limit === 'number' && Number.isInteger(q.limit) && q.limit > 0 ? Math.min(q.limit, LOG_PAGE_MAX) : LOG_PAGE_DEFAULT
  const search = typeof q.search === 'string' && q.search.trim() ? q.search.trim().slice(0, SEARCH_MAX) : null
  const cursor = typeof q.cursor === 'string' && q.cursor && q.cursor.length <= CURSOR_MAX ? q.cursor : null
  return {
    levels: q.levels === 'all' ? 'all' : 'problems',
    since: isoOrNull(q.since),
    until: isoOrNull(q.until),
    search,
    cursor,
    limit,
  }
}

const PROBLEM_LEVELS: ReadonlySet<LogLevel> = new Set(['error', 'warn'])

/** Whether one line is wanted by a query's level, time range and search. */
export function logLineMatches(line: LogLine, q: LogQuery): boolean {
  if (q.levels === 'problems' && !PROBLEM_LEVELS.has(line.level)) return false
  if (q.since && line.at < q.since) return false
  if (q.until && line.at >= q.until) return false
  if (q.search) {
    const needle = q.search.toLowerCase()
    const hay = `${line.message}\n${line.source}\n${line.fields ? JSON.stringify(line.fields) : ''}`.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  return true
}
