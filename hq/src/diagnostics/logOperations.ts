/**
 * The logs of one source at a time, their download, and the support bundle
 * (logs and diagnostics spec), for fleet admins only (`assertFleetAdmin`). A site's lines
 * are read from the site when asked and kept nowhere in HQ (adr-0106).
 */
import { HttpError } from 'wasp/server'
import type {
  GetLogSources,
  GetLogs,
  DownloadLogs,
  BuildSupportBundle,
} from 'wasp/server/operations'
import { assertFleetAdmin } from '../sites/assertAdmin'
import { readEnvStatus } from '../settings/queries'
import { findLogSource, linesAsText, listLogSources, readAllLines, readLogsPage, type LogSource, type LogsPage } from './logSources'
import { buildSupportBundle as build, type BundleOptions, type SupportBundle } from './supportBundle'
import { BRANDING } from '@agenthix/core'

type LogsArgs = { source: string; levels?: 'problems' | 'all'; since?: string; until?: string; search?: string; cursor?: string; limit?: number }

async function source(args: { source?: unknown } | undefined) {
  if (!args || typeof args.source !== 'string') throw new HttpError(400, 'source is required')
  const found = await findLogSource(args.source)
  if (!found) throw new HttpError(404, 'No such log source')
  return found
}

export const getLogSources: GetLogSources<void, LogSource[]> = async (_args, context) => {
  await assertFleetAdmin(context)
  return listLogSources()
}

export const getLogs: GetLogs<LogsArgs, LogsPage> = async (args, context) => {
  await assertFleetAdmin(context)
  return readLogsPage(await source(args), args)
}

export type LogsDownload = { fileName: string; text: string; lines: number; truncated: boolean; notice: string | null }

export const downloadLogs: DownloadLogs<Omit<LogsArgs, 'cursor' | 'limit'>, LogsDownload> = async (args, context) => {
  await assertFleetAdmin(context)
  const found = await source(args)
  const { cursor: _cursor, limit: _limit, ...filters } = args as LogsArgs
  const read = await readAllLines(found, filters)
  const name = found.info.kind === 'hq' ? 'hq' : found.info.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'
  return {
    fileName: `${BRANDING.cliCommand}-logs-${name}-${new Date().toISOString().slice(0, 10)}.txt`,
    text: linesAsText(read.lines),
    lines: read.lines.length,
    truncated: read.truncated,
    notice: read.source.notice,
  }
}

export const buildSupportBundle: BuildSupportBundle<Partial<BundleOptions> | void, SupportBundle> = async (args, context) => {
  const me = await assertFleetAdmin(context)
  const opts: BundleOptions = {
    logs: args && args.logs === '7d' ? '7d' : '24h',
    levels: args && args.levels === 'problems' ? 'problems' : 'all',
  }
  // The settings HQ checks for Infrastructure › HQ, from the same function, so the list cannot drift. The fleet
  // admin check above is this operation's own; the organisation admin check of that screen is not repeated.
  const env = readEnvStatus()
  const settings = env.sections.flatMap(s => s.keys.map(k => ({ name: k.key, set: k.set })))
  return build(me, opts, settings)
}
