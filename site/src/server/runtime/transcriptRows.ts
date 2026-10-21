/**
 * TranscriptEntry row access — plan 5d-2 task 3. Authored BY SITE.
 *
 * Chronological ascending — the opposite order from runRows.ts's `run.list`,
 * which is always newest-first. The UI renders a transcript oldest-first
 * (top-to-bottom reading order), so this list flips the run-list convention
 * on purpose rather than by omission.
 *
 * `tail` (finding 1) asks Prisma for the newest `limit` rows (`orderBy: desc`
 * + `take`) and reverses the page in memory back to ascending before
 * returning — the DB does the narrowing, not a full-table fetch followed by
 * an in-memory slice.
 *
 * Two rows carry their run's state now, read in one more query for the page:
 * a person's message its run's status (`PENDING` while it waits behind a
 * running reply), and an approval request the request and its answer, which
 * are the run's own (core's `TranscriptApproval`).
 */
import { prisma } from '#db'
import type { TokenUsage, TranscriptApproval, TranscriptEntryKind, TranscriptRow } from '@agenthix/core'

/** What `run.reject` records as the error when the person gave no reason. */
const NO_REASON = 'Rejected'

type RunState = {
  id: string
  status: TranscriptRow['runStatus'] & string
  manifestStatus: TranscriptApproval['status'] | null
  pendingManifest: TranscriptApproval['request']
  manifestDecidedById: string | null
  manifestDecidedAt: Date | null
  error: string | null
}

function approvalOf(run: RunState | undefined): TranscriptApproval | null {
  if (!run?.manifestStatus) return null
  return {
    status: run.manifestStatus,
    request: run.pendingManifest ?? null,
    decidedById: run.manifestDecidedById,
    decidedAt: run.manifestDecidedAt?.toISOString() ?? null,
    reason: run.manifestStatus === 'REJECTED' && run.error && run.error !== NO_REASON ? run.error : null,
  }
}

export async function listTranscript(
  sessionId: string,
  opts?: { limit?: number; tail?: boolean; toolUseIds?: string[] },
): Promise<TranscriptRow[]> {
  const entries = await prisma.transcriptEntry.findMany({
    where: { sessionId, ...(opts?.toolUseIds ? { role: 'TOOL' as const, toolUseId: { in: opts.toolUseIds } } : {}) },
    orderBy: { createdAt: opts?.tail ? 'desc' : 'asc' },
    ...(opts?.limit !== undefined ? { take: opts.limit } : {}),
  })
  const ordered = opts?.tail ? entries.reverse() : entries

  const stateful = [...new Set(ordered
    .filter(e => e.runId && (e.role === 'USER' || e.kind === 'APPROVAL_REQUESTED'))
    .map(e => e.runId as string))]
  const runs = stateful.length > 0
    ? await prisma.agentRun.findMany({
        where: { id: { in: stateful } },
        select: { id: true, status: true, manifestStatus: true, pendingManifest: true, manifestDecidedById: true, manifestDecidedAt: true, error: true },
      })
    : []
  const runById = new Map((runs as RunState[]).map(r => [r.id, r]))

  return ordered.map((entry) => {
    const run = entry.runId ? runById.get(entry.runId) : undefined
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      role: entry.role as TranscriptRow['role'],
      authorId: entry.authorId,
      content: entry.content,
      thought: entry.thought,
      thinkingDurationMs: entry.thinkingDurationMs,
      toolName: entry.toolName,
      toolInput: entry.toolInput as TranscriptRow['toolInput'],
      toolOutput: entry.toolOutput as TranscriptRow['toolOutput'],
      toolUseId: entry.toolUseId,
      model: entry.model,
      usage: (entry.usage ?? null) as TokenUsage | null,
      runId: entry.runId ?? null,
      kind: (entry.kind ?? null) as TranscriptEntryKind | null,
      detail: (entry.detail ?? null) as TranscriptRow['detail'],
      runStatus: entry.role === 'USER' ? run?.status ?? null : null,
      approval: entry.kind === 'APPROVAL_REQUESTED' ? approvalOf(run) : null,
      createdAt: entry.createdAt.toISOString(),
    }
  })
}
