/**
 * This service's own log file (adr-0106): where `Logger` writes each line
 * after standard output, and what the logs page reads back. Rolling and
 * retention are core's `RollingLog`; this hands it `node:fs`.
 *
 * Nothing is written until `startLogFile` names the folder at boot, so tests
 * and scripts that only import a logger touch no disk.
 */
import fs from 'node:fs/promises'
import { RollingLog, type LogFs, type LogLine, type LogPage, type LogQuery } from '@agenthix/core'

const nodeFs: LogFs = {
  mkdir: async dir => { await fs.mkdir(dir, { recursive: true, mode: 0o700 }) },
  list: dir => fs.readdir(dir).catch(() => []),
  size: async file => (await fs.stat(file).catch(() => null))?.size ?? 0,
  append: (file, text) => fs.appendFile(file, text, { mode: 0o600 }),
  read: file => fs.readFile(file, 'utf8'),
  remove: file => fs.rm(file, { force: true }),
}

let log: RollingLog | null = null

export function startLogFile(dir: string): void {
  if (log) return
  log = new RollingLog(dir, nodeFs, {
    // Straight to standard error: through the logger it would try the same file again.
    onError: err => console.error(`The log file in ${dir} could not be written; logging to standard output only: ${err instanceof Error ? err.message : String(err)}`),
  })
}

export function writeLogLine(line: LogLine): void {
  log?.write(line)
}

export async function readLogFile(query: LogQuery): Promise<LogPage> {
  return log ? log.read(query) : { lines: [], nextCursor: null }
}

export function logFileStarted(): boolean {
  return log !== null
}
