/**
 * A service's own log on its own disk (adr-0106): JSON lines in one folder,
 * rolled by day and by size, kept for **7 days or 100 MB, whichever comes
 * first**, the oldest file dropped first. Not a setting.
 *
 * Files are named `YYYY-MM-DD.NNN.jsonl` (the UTC day, then a segment number),
 * so their names sort in the order they were written. A segment closes at
 * 10 MB, which is also how finely the size limit drops old lines.
 *
 * The file system is handed in (`LogFs`), so this module stays free of Node
 * and both apps share it; each passes `node:fs`. Writes are queued in order
 * and never throw: a log that cannot be written must not take the service
 * down, so the failure goes to `onError` once and writing carries on.
 */
import { serializeLogLine, parseLogLine, type LogLine } from './logLine.js'
import { logLineMatches, type LogPage, type LogQuery } from './logQuery.js'

export type LogFs = {
  mkdir(dir: string): Promise<void>
  /** File names in the folder; empty when the folder does not exist. */
  list(dir: string): Promise<string[]>
  /** Size in bytes; 0 when the file does not exist. */
  size(file: string): Promise<number>
  append(file: string, text: string): Promise<void>
  read(file: string): Promise<string>
  remove(file: string): Promise<void>
}

export const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const LOG_MAX_TOTAL_BYTES = 100 * 1024 * 1024
export const LOG_SEGMENT_MAX_BYTES = 10 * 1024 * 1024
const PRUNE_EVERY_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.(\d{3,})\.jsonl$/

type Segment = { name: string; day: string; seq: number }

function segmentOf(name: string): Segment | null {
  const m = FILE_NAME.exec(name)
  return m ? { name, day: m[1], seq: Number(m[2]) } : null
}

function nameOf(day: string, seq: number): string {
  return `${day}.${String(seq).padStart(3, '0')}.jsonl`
}

/** Oldest first: by day, then segment. */
function bySequence(a: Segment, b: Segment): number {
  return a.day === b.day ? a.seq - b.seq : a.day < b.day ? -1 : 1
}

export function utf8Length(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++ }
    else bytes += 3
  }
  return bytes
}

export type RollingLogOptions = {
  now?: () => Date
  retentionMs?: number
  maxTotalBytes?: number
  segmentMaxBytes?: number
  onError?: (err: unknown) => void
}

export class RollingLog {
  private queue: Promise<void> = Promise.resolve()
  private current: (Segment & { size: number }) | null = null
  private lastPrune = 0
  private failed = false
  private readonly now: () => Date
  private readonly retentionMs: number
  private readonly maxTotalBytes: number
  private readonly segmentMaxBytes: number

  constructor(private readonly dir: string, private readonly fs: LogFs, private readonly opts: RollingLogOptions = {}) {
    this.now = opts.now ?? (() => new Date())
    this.retentionMs = opts.retentionMs ?? LOG_RETENTION_MS
    this.maxTotalBytes = opts.maxTotalBytes ?? LOG_MAX_TOTAL_BYTES
    this.segmentMaxBytes = opts.segmentMaxBytes ?? LOG_SEGMENT_MAX_BYTES
  }

  private path(name: string): string {
    return `${this.dir}/${name}`
  }

  write(line: LogLine): void {
    const text = `${serializeLogLine(line)}\n`
    this.queue = this.queue.then(() => this.append(line.at.slice(0, 10), text)).catch(err => {
      if (!this.failed) this.opts.onError?.(err)
      this.failed = true
    })
  }

  /** Resolves once every line written so far is on disk (or has failed). */
  flush(): Promise<void> {
    return this.queue
  }

  private async segments(): Promise<Segment[]> {
    const names = await this.fs.list(this.dir)
    return names.map(segmentOf).filter((s): s is Segment => s !== null).sort(bySequence)
  }

  private async append(day: string, text: string): Promise<void> {
    const bytes = utf8Length(text)
    if (!this.current) {
      await this.fs.mkdir(this.dir)
      await this.prune()
      const latest = (await this.segments()).filter(s => s.day === day).pop()
      this.current = latest
        ? { ...latest, size: await this.fs.size(this.path(latest.name)) }
        : { name: nameOf(day, 0), day, seq: 0, size: 0 }
    }
    let rolled = false
    if (this.current.day !== day) {
      this.current = { name: nameOf(day, 0), day, seq: 0, size: 0 }
      rolled = true
    } else if (this.current.size > 0 && this.current.size + bytes > this.segmentMaxBytes) {
      const seq = this.current.seq + 1
      this.current = { name: nameOf(day, seq), day, seq, size: 0 }
      rolled = true
    }
    await this.fs.append(this.path(this.current.name), text)
    this.current.size += bytes
    this.failed = false
    if (rolled || this.now().getTime() - this.lastPrune >= PRUNE_EVERY_MS) await this.prune()
  }

  /** Drops whole files: every one older than the retention, then the oldest until the folder is under its size. */
  async prune(): Promise<void> {
    const now = this.now().getTime()
    this.lastPrune = now
    let files = await this.segments()
    for (const s of files) {
      const endOfDay = Date.parse(`${s.day}T00:00:00.000Z`) + DAY_MS
      if (endOfDay <= now - this.retentionMs && s.name !== this.current?.name) await this.fs.remove(this.path(s.name))
    }
    files = await this.segments()
    const sizes = await Promise.all(files.map(s => this.fs.size(this.path(s.name))))
    let total = sizes.reduce((a, b) => a + b, 0)
    for (let i = 0; i < files.length && total > this.maxTotalBytes; i++) {
      if (files[i].name === this.current?.name) break
      await this.fs.remove(this.path(files[i].name))
      total -= sizes[i]
    }
  }

  /**
   * One page, newest first. A cursor names a file and a line in it; the page
   * goes on from the line before. Files outside the query's days are not opened.
   */
  async read(q: LogQuery): Promise<LogPage> {
    await this.flush()
    const at = parseCursor(q.cursor)
    const sinceDay = q.since?.slice(0, 10) ?? null
    const untilDay = q.until?.slice(0, 10) ?? null
    const files = (await this.segments()).reverse().filter(s => {
      if (at && bySequence(s, at.segment) > 0) return false
      if (sinceDay && s.day < sinceDay) return false
      if (untilDay && s.day > untilDay) return false
      return true
    })
    const lines: LogLine[] = []
    for (const s of files) {
      let text: string
      try {
        text = await this.fs.read(this.path(s.name))
      } catch {
        continue // dropped by a prune since the listing
      }
      const raw = text.split('\n')
      const start = at && at.segment.name === s.name ? Math.min(at.line, raw.length) : raw.length
      for (let i = start - 1; i >= 0; i--) {
        const line = parseLogLine(raw[i])
        if (!line) continue
        if (q.since && line.at < q.since) return { lines, nextCursor: null }
        if (!logLineMatches(line, q)) continue
        lines.push(line)
        if (lines.length >= q.limit) return { lines, nextCursor: i > 0 || s !== files[files.length - 1] ? `${s.name}:${i}` : null }
      }
    }
    return { lines, nextCursor: null }
  }
}

function parseCursor(cursor: string | null): { segment: Segment; line: number } | null {
  if (!cursor) return null
  const sep = cursor.lastIndexOf(':')
  const segment = segmentOf(cursor.slice(0, sep))
  const line = Number(cursor.slice(sep + 1))
  return segment && Number.isInteger(line) && line >= 0 ? { segment, line } : null
}
