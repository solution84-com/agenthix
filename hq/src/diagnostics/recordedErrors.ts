/**
 * The errors HQ keeps for 7 days (logs and diagnostics spec, Recent errors):
 * written here, read back grouped by `recentErrors.ts`.
 *
 * Two kinds of write. `recordError` is one occurrence — a run that failed, a
 * request GitHub refused — and a key per occurrence makes a repeated report of
 * the same one count once. `recordCondition` is a state that lasts — Docker
 * not running on a site — and is seen again on every pass while it does: one
 * row per stretch, its `lastAt` moved on while it lasts, so "since 13:02" is
 * the row's `firstAt`.
 *
 * Neither ever throws. An error that cannot be recorded must not become a
 * second failure in whatever met the first one.
 */
import { prisma } from 'wasp/server'
import { redactText } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import type { Advice } from './errorAdvice'

const logger = new Logger('RecentErrors')

export const RECENT_ERRORS_KEPT_MS = 7 * 24 * 60 * 60 * 1000

/** A condition seen again within this long is the same stretch; site notifications re-check every 30 s. */
export const CONDITION_GAP_MS = 3 * 60 * 1000

const DETAIL_MAX = 1000

export type ErrorOrigin = 'run' | 'site' | 'github' | 'scheduler' | 'hq'

export type ErrorReport = {
  origin: ErrorOrigin
  /** What failed, as the group's key: occurrences under one key are one problem. */
  subject: string
  advice: Advice
  detail?: string | null
  siteId?: string | null
  agentId?: string | null
  projectId?: string | null
  /** Only for a task run: a chat run is its owner's alone (adr-0041). */
  runId?: string | null
  sessionId?: string | null
  /** Set when the same occurrence may be reported twice. */
  occurrenceKey?: string | null
  at?: Date
}

function rowOf(r: ErrorReport) {
  const at = r.at ?? new Date()
  const detail = r.detail ? redactText(r.detail).slice(0, DETAIL_MAX) : null
  return {
    groupKey: `${r.origin}:${r.advice.kind}:${r.subject}`,
    origin: r.origin,
    title: r.advice.title,
    advice: r.advice.advice,
    detail,
    siteId: r.siteId ?? null,
    agentId: r.agentId ?? null,
    projectId: r.projectId ?? null,
    runId: r.runId ?? null,
    sessionId: r.sessionId ?? null,
    occurrenceKey: r.occurrenceKey ?? null,
    firstAt: at,
    lastAt: at,
  }
}

export async function recordError(report: ErrorReport): Promise<void> {
  try {
    await prisma.recordedError.createMany({ data: [rowOf(report)], skipDuplicates: true })
  } catch (err) {
    logger.warn(`could not record an error (${report.origin}: ${report.advice.title})`, err)
  }
}

export async function recordCondition(report: ErrorReport): Promise<void> {
  const row = rowOf(report)
  try {
    const open = await prisma.recordedError.findFirst({
      where: { groupKey: row.groupKey, lastAt: { gte: new Date(row.lastAt.getTime() - CONDITION_GAP_MS) } },
      orderBy: { lastAt: 'desc' },
      select: { id: true },
    })
    if (open) {
      await prisma.recordedError.update({
        where: { id: open.id },
        data: { lastAt: row.lastAt, title: row.title, advice: row.advice, detail: row.detail },
      })
    } else {
      await prisma.recordedError.create({ data: { ...row, occurrenceKey: null } })
    }
  } catch (err) {
    logger.warn(`could not record a condition (${report.advice.title})`, err)
  }
}

export async function pruneRecordedErrors(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.recordedError.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - RECENT_ERRORS_KEPT_MS) } } })
  return count
}
