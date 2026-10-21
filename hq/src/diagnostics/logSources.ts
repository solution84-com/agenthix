/**
 * Reading the logs of one source at a time: HQ's own file, or a site's,
 * read from the site over the control channel when an admin asks (adr-0106).
 * Nothing read from a site is kept: it is checked, its secrets removed again,
 * and handed to the page.
 *
 * A source is `hq`, or a site's `ExecutionSite.id`, the id its page has. A site
 * that is not connected is named with the reason and
 * no lines: its log is on its own machine, and HQ holds no copy.
 */
import { prisma } from 'wasp/server'
import {
  SITE_DIAGNOSTICS_METHODS,
  logLineText,
  parseLogQuery,
  sanitizeLogLine,
  type LogLine,
  type LogQuery,
  type SiteReadLogsResult,
} from '@agenthix/core'
import { readLogFile } from '../server/utils/logFile'
import { displaySiteName } from '../shared/siteName'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'

export const HQ_SOURCE = 'hq'

const SITE_READ_TIMEOUT_MS = 15_000
/** The most lines one download or one bundle file carries; the newest are kept. */
export const DOWNLOAD_MAX_LINES = 20_000

export type LogSource = {
  source: string
  label: string
  kind: 'hq' | 'site'
  connected: boolean
  /** Why its lines cannot be read now; null when they can. */
  notice: string | null
}

export type LogsPage = {
  source: LogSource
  lines: LogLine[]
  nextCursor: string | null
}

type SiteRow = { id: string; siteId: string; label: string; isDefault: boolean }

function siteSource(site: SiteRow): LogSource {
  const connected = siteChannelRegistry.isOnline(site.siteId)
  const label = displaySiteName(site)
  const notice = connected ? null : `${label} is not connected, so its logs cannot be read now. They are kept on its own machine.`
  return { source: site.id, label, kind: 'site', connected, notice }
}

const HQ: LogSource = { source: HQ_SOURCE, label: 'HQ', kind: 'hq', connected: true, notice: null }

const SITE_SELECT = { id: true, siteId: true, label: true, isDefault: true } as const

export async function listLogSources(): Promise<LogSource[]> {
  const sites = await prisma.executionSite.findMany({
    where: { status: { not: 'REVOKED' } },
    select: SITE_SELECT,
    orderBy: { registeredAt: 'asc' },
  })
  return [HQ, ...sites.map(siteSource)]
}

/** Null when there is no such source. */
export async function findLogSource(source: string): Promise<{ info: LogSource; site: SiteRow | null } | null> {
  if (source === HQ_SOURCE) return { info: HQ, site: null }
  const site = await prisma.executionSite.findFirst({ where: { id: source, status: { not: 'REVOKED' } }, select: SITE_SELECT })
  return site ? { info: siteSource(site), site } : null
}

async function readSitePage(site: SiteRow, query: LogQuery): Promise<{ lines: LogLine[]; nextCursor: string | null }> {
  const page = await siteChannelRegistry.request(site.siteId, SITE_DIAGNOSTICS_METHODS.readLogs, query, SITE_READ_TIMEOUT_MS)
  const lines = Array.isArray(page?.lines) ? page.lines.map(sanitizeLogLine).filter((l): l is LogLine => l !== null) : []
  const nextCursor = typeof page?.nextCursor === 'string' ? page.nextCursor : null
  return { lines: lines.slice(0, query.limit), nextCursor }
}

/** One page of one source. A site that fails to answer comes back with the reason, not as a thrown error. */
export async function readLogsPage(found: { info: LogSource; site: SiteRow | null }, input: unknown): Promise<LogsPage> {
  const query = parseLogQuery(input)
  if (!found.site) return { source: found.info, ...(await readLogFile(query)) }
  if (found.info.notice) return { source: found.info, lines: [], nextCursor: null }
  try {
    return { source: found.info, ...(await readSitePage(found.site, query)) }
  } catch (err) {
    const why = err instanceof ChannelRequestFailed && err.code === 'offline'
      ? `${found.info.label} is not connected, so its logs cannot be read now.`
      : `${found.info.label} did not send its logs: ${err instanceof Error ? err.message : String(err)}`
    return { source: { ...found.info, notice: why }, lines: [], nextCursor: null }
  }
}

/** Every line of a source and range, newest first, up to `max`; with whatever stopped it short. */
export async function readAllLines(
  found: { info: LogSource; site: SiteRow | null },
  input: unknown,
  max: number = DOWNLOAD_MAX_LINES,
): Promise<{ source: LogSource; lines: LogLine[]; truncated: boolean }> {
  const lines: LogLine[] = []
  let cursor: string | null = null
  let source = found.info
  do {
    const page = await readLogsPage(found, { ...(input as object), cursor, limit: 1000 })
    source = page.source
    lines.push(...page.lines)
    cursor = page.nextCursor
  } while (cursor && lines.length < max && !source.notice)
  return { source, lines: lines.slice(0, max), truncated: lines.length >= max && cursor !== null }
}

/** Oldest first, one line each, as a person reads a log file. */
export function linesAsText(lines: LogLine[]): string {
  return lines.length === 0 ? '' : `${[...lines].reverse().map(l => logLineText(l)).join('\n')}\n`
}
