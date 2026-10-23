/**
 * The relay's usage reports on their way to hq, delivered at least once (models from one place, part 5): each report
 * is a file of its own under the site's root until hq acknowledges its call id, so a restart of the site or an hq
 * that cannot be reached loses none. hq counts a call id once, so a report sent twice is harmless.
 *
 * Reports go in batches, soon after a call ends, and what hq did not acknowledge is sent again after a pause that
 * grows while hq keeps failing. The disk is bounded: past `MAX_PENDING` reports waiting, a new one is dropped and
 * logged rather than filling the disk.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { isCallId, type UsageReport } from '@agenthix/core'
import { getSiteRoot } from '../../agents/agentDiskPaths'
import { writeFileAtomic } from '../../agents/runtime/credentialFile'
import { Logger } from '../utils/logger'
import { sendUsageReports } from './usageReportClient'

/** Under hq's limit of `USAGE_REPORT_BATCH_MAX`, and well inside hq's JSON body limit. */
export const USAGE_BATCH = 100
export const MAX_PENDING = 50_000
const SOON_MS = 1_000
const RETRY_FIRST_MS = 30_000
const RETRY_MAX_MS = 10 * 60_000

export type UsageOutboxDeps = {
  dir: string
  /** The call ids hq acknowledged. Throws when hq could not be asked or refused the batch. */
  send: (reports: UsageReport[]) => Promise<string[]>
  log: (line: string) => void
}

export class UsageOutbox {
  private pending: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<void> | null = null
  private retryMs = RETRY_FIRST_MS
  private stopped = false

  constructor(private readonly deps: UsageOutboxDeps) {}

  /** Keeps the report on disk and sends it soon. */
  async add(report: UsageReport): Promise<void> {
    if (!isCallId(report.callId)) return
    const waiting = await this.count()
    if (waiting >= MAX_PENDING) {
      this.deps.log(`Usage report for call ${report.callId} dropped: ${waiting} are already waiting for HQ`)
      return
    }
    await writeFileAtomic(this.fileOf(report.callId), JSON.stringify(report))
    this.pending = waiting + 1
    this.schedule(SOON_MS)
  }

  /** Delivers what an earlier run of the site left waiting. */
  start(): void {
    this.stopped = false
    this.schedule(SOON_MS)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Sends everything waiting, a batch at a time, until hq stops acknowledging. One flush runs at a time. */
  flush(): Promise<void> {
    this.flushing ??= this.flushAll().finally(() => { this.flushing = null })
    return this.flushing
  }

  private async flushAll(): Promise<void> {
    for (;;) {
      const batch = await this.readBatch()
      this.pending = batch.total
      if (batch.reports.length === 0) {
        this.retryMs = RETRY_FIRST_MS
        return
      }
      let acknowledged: string[]
      try {
        acknowledged = await this.deps.send(batch.reports)
      } catch (err) {
        this.deps.log(`Usage reports not delivered to HQ (${batch.total} waiting): ${err instanceof Error ? err.message : String(err)}`)
        this.retryLater()
        return
      }
      const sent = new Set(batch.reports.map(r => r.callId))
      const kept = acknowledged.filter(id => sent.has(id))
      await Promise.all(kept.map(id => fs.rm(this.fileOf(id), { force: true })))
      this.pending = Math.max(0, batch.total - kept.length)
      if (kept.length < batch.reports.length) {
        this.retryLater()
        return
      }
      this.retryMs = RETRY_FIRST_MS
    }
  }

  private async readBatch(): Promise<{ reports: UsageReport[]; total: number }> {
    const names = await this.names()
    const reports: UsageReport[] = []
    for (const name of names) {
      if (reports.length >= USAGE_BATCH) break
      try {
        reports.push(JSON.parse(await fs.readFile(path.join(this.deps.dir, name), 'utf8')) as UsageReport)
      } catch {
        // A file that cannot be read is never going to be delivered: take it away rather than retry it forever.
        this.deps.log(`Usage report ${name} could not be read and was removed`)
        await fs.rm(path.join(this.deps.dir, name), { force: true })
      }
    }
    return { reports, total: names.length }
  }

  private async names(): Promise<string[]> {
    try {
      return (await fs.readdir(this.deps.dir)).filter(n => n.endsWith('.json') && isCallId(n.slice(0, -5)))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  private async count(): Promise<number> {
    this.pending ??= (await this.names()).length
    return this.pending
  }

  private fileOf(callId: string): string {
    return path.join(this.deps.dir, `${callId}.json`)
  }

  private retryLater(): void {
    this.schedule(this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS)
  }

  private schedule(ms: number): void {
    if (this.stopped || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch(err => this.deps.log(`Usage reports: ${err instanceof Error ? err.message : String(err)}`))
    }, ms)
    this.timer.unref?.()
  }
}

const logger = new Logger('usageReports')

let outbox: UsageOutbox | null = null

/** The site's one outbox, in `<site root>/usage-reports`. */
export function usageOutbox(): UsageOutbox {
  outbox ??= new UsageOutbox({
    dir: path.join(getSiteRoot(), 'usage-reports'),
    send: sendUsageReports,
    log: line => logger.warn(line),
  })
  return outbox
}
