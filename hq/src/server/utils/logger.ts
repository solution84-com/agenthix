/**
 * A source's logger (adr-0106). Each line gets a date and time, a level, this
 * logger's tag as its source, the message, and fields from the extra
 * arguments — a plain object's keys, an error, anything else as `args` — with
 * secrets removed before it is printed or written (core's `makeLogLine`).
 * Printed to standard output, so `docker compose logs` still shows it, and
 * written to the service's own rolling file.
 */
import { logLineText, makeLogLine, type LogLevel } from '@agenthix/core'
import { writeLogLine } from './logFile'

export class Logger {
  private tag: string

  constructor(tag: string) {
    this.tag = tag
  }

  private write(level: LogLevel, message: string, args: unknown[]) {
    const line = makeLogLine(level, this.tag, message, args)
    const text = logLineText(line, { multiline: true })
    if (level === 'error') console.error(text)
    else if (level === 'warn') console.warn(text)
    else console.log(text)
    writeLogLine(line)
  }

  info(message: string, ...args: unknown[]) {
    this.write('info', message, args)
  }

  error(message: string, ...args: unknown[]) {
    this.write('error', message, args)
  }

  warn(message: string, ...args: unknown[]) {
    this.write('warn', message, args)
  }

  success(message: string, ...args: unknown[]) {
    this.write('info', message, args)
  }

  /**
   * Standard output only, never the log file: for what only whoever runs this
   * machine may read, such as the one-time first-admin link, which admins can
   * otherwise read on the logs page or in a support bundle.
   */
  printOnly(message: string) {
    console.log(logLineText(makeLogLine('info', this.tag, message)))
  }
}
