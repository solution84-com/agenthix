/**
 * Logs and diagnostics at boot (adr-0106): HQ's own log file under its
 * storage, failed runs recorded as recent errors, and the errors older than
 * 7 days dropped every hour.
 */
import path from 'node:path'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { startLogFile } from '../server/utils/logFile'
import { Logger } from '../server/utils/logger'
import { registerRunFailureRecorder } from './runFailures'
import { pruneRecordedErrors } from './recordedErrors'

const logger = new Logger('Diagnostics')

const PRUNE_EVERY_MS = 60 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

export function startLogging(): void {
  startLogFile(path.join(getHqStorageRoot(), 'logs'))
}

export function startDiagnostics(): void {
  registerRunFailureRecorder()
  if (timer) return
  const prune = () => void pruneRecordedErrors().catch(err => logger.warn('could not drop old recent errors', err))
  prune()
  timer = setInterval(prune, PRUNE_EVERY_MS)
  timer.unref?.()
}
