/**
 * Boot-time crash-recovery sweep over site's own AgentRun (plan 5d-2 task 8,
 * SC-342) — verbatim semantics from hq's setup.ts orphaned-run cleanup
 * (`status IN (PENDING, RUNNING) → FAILED`), now over the four models site
 * owns. A run swept here didn't just lose its in-memory record the way hq's
 * original cleanup assumed — a site restart mid-run means the run is
 * genuinely gone, and hq's task machine (and any open session view) needs to
 * hear about it. But the channel may not be open yet at the moment this
 * sweep runs (site's own boot races hq's reachability) — so every swept run
 * is ALSO buffered as a `RunStatusEvent` and flushed once the channel next
 * opens (`hqConnectionManager.onOpen`, wired from setup.ts), rather than
 * fired immediately and silently dropped by `siteStream.status`'s own
 * fire-and-forget posture.
 */
import { prisma } from '#db'
import type { RunStatusEvent } from '@agenthix/core'
import { siteStream } from '../../agents/runtime/SiteStreamEmitter'
import { Logger } from '../utils/logger'

const logger = new Logger('BootSweep')

export const BOOT_SWEEP_ERROR = 'Server restarted — run was orphaned'

/** What the conversation shows where a swept run's reply would have been. */
export const BOOT_SWEEP_REASON = 'The site restarted while the agent was working.'

/** Module-level by design — one process, one boot, one buffer; drained by
 *  flushBootSweepBuffer() once, on the channel's first open after this boot. */
export const bootSweepBuffer: RunStatusEvent[] = []

export async function runCrashRecoverySweep(): Promise<{ swept: number }> {
  const orphaned = await prisma.agentRun.findMany({ where: { status: { in: ['PENDING', 'RUNNING'] } } })
  if (orphaned.length === 0) return { swept: 0 }

  const endedAt = new Date()
  await prisma.agentRun.updateMany({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'FAILED', error: BOOT_SWEEP_ERROR, endedAt },
  })
  // Each conversation says so where the reply would have been. Best effort: the sweep must finish.
  await prisma.transcriptEntry.createMany({
    data: orphaned.map(run => ({
      sessionId: run.sessionId, runId: run.id, role: 'SYSTEM' as const, kind: 'RUN_FAILED' as const,
      content: BOOT_SWEEP_REASON, detail: { reason: BOOT_SWEEP_REASON }, createdAt: endedAt,
    })),
  }).catch((err: unknown) => logger.warn(`could not record the swept runs in their transcripts: ${err instanceof Error ? err.message : String(err)}`))

  for (const run of orphaned) {
    // Site has no Agent table, and the stored dispatch blob carries only
    // {kind} — no agent config (spec review, HIGH: no secret or provider key
    // at rest) — so agentHandle is the bare agentId, same fallback
    // dispatchHandler.ts's run.reject uses for the same reason.
    bootSweepBuffer.push({
      runId: run.id,
      sessionId: run.sessionId,
      taskId: run.taskId,
      agentId: run.agentId,
      agentHandle: run.agentId,
      status: 'FAILED',
      error: BOOT_SWEEP_ERROR,
      sessionPatch: null,
      manifestPending: null,
    })
  }

  logger.info(`cleaned up ${orphaned.length} orphaned run(s) — buffered for flush on hq reconnect`)
  return { swept: orphaned.length }
}

/** Drains the buffer atomically before sending — a listener firing again
 *  mid-flush (unlikely, but `onOpen` never de-registers) sees nothing left. */
export function flushBootSweepBuffer(): void {
  if (bootSweepBuffer.length === 0) return
  const frames = bootSweepBuffer.splice(0, bootSweepBuffer.length)
  for (const event of frames) siteStream.status(event)
  logger.info(`flushed ${frames.length} buffered boot-sweep FAILED frame(s)`)
}
