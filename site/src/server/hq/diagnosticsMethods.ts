/**
 * What hq asks for the logs and diagnostics page (core's siteDiagnostics.ts):
 * a page of this site's own log, read from its file, and its health taken now.
 * Neither changes anything here; reading the log is not authority over the
 * machine (adr-0106).
 */
import { parseLogQuery, type SiteHealth, type SiteReadLogsResult } from '@agenthix/core'
import { readLogFile } from '../utils/logFile'
import { takeHealth } from './siteHealthReport'

export function readLogs(params: unknown): Promise<SiteReadLogsResult> {
  return readLogFile(parseLogQuery(params))
}

export function healthNow(): Promise<SiteHealth> {
  return takeHealth()
}
