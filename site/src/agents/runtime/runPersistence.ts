/** Transcript and audit-log persistence for a finished run.
 *
 * Severed from hq/src/agents/runtime/runPersistence.ts (plan 5d-2 task 7b):
 *  - `db: any` (hq's Wasp job-context entities) → site's own `prisma` import
 *    directly (`#db` here is site's own client on its own schema — TranscriptEntry
 *    and ToolCallLog are two of the four runtime models site now owns).
 *  - it returns the reply's text for the run's audit summary; it never sends
 *    a status frame itself.
 *
 * The transcript is the conversation's whole record (core's `transcript.ts`):
 * every row names its run, each tool line and each stretch of thinking is
 * written at the time it happened, and how the run ended is a row of its own —
 * a failure with its reason in plain words, a stop with who stopped it — so a
 * run that did things and then failed or was stopped still shows them.
 */
import { prisma } from '#db'
import { Prisma } from '@prisma/client'
import type { ContextSummarisedDetail, RunFailedDetail, RunResourceShortage, RunStopCause, RunStoppedDetail } from '@agenthix/core'
import { shapeAgentReply } from './agentUtils'
import { Logger } from '../../server/utils/logger'
import type { AuditSummary } from './types'
import type { StreamedRun } from './runEventLoop'

const logger = new Logger('AgentEngine')

/** What a turn that ended with no text and no tool call records: only that — the reason, when there was one, is on a failed run. */
export const NO_REPLY_TEXT = 'The agent ended its turn without a reply.'

/** How the run ended, for the row that says so. */
export type RunEnding =
  | { kind: 'completed' }
  | { kind: 'stopped'; cause: RunStopCause; by: string | null }
  | { kind: 'failed'; reason: string; resource?: RunResourceShortage }

type Recorded = Pick<StreamedRun, 'fullReply' | 'accumulatedThought' | 'accThinkingMs' | 'usedModel' | 'runUsage' | 'toolCallMap'> &
  Partial<Pick<StreamedRun, 'thoughts' | 'compactions'>>

interface PersistRunOutputParams {
  sessionId: string
  runId: string
  streamed: Recorded
  resolvedModel: string
  ending: RunEnding
  /** A Summarise now turn: it says nothing, and that is not worth a line. */
  summarise?: boolean
  /** Who the run is for, named on a summary somebody asked for. */
  personId?: string | null
}

type Row = Prisma.TranscriptEntryCreateManyInput

// Postgres text/jsonb reject the NUL character (codepoint U+0000); strip it recursively from
// anything we persist. Tool I/O can contain NULs (e.g. reading binary .git/objects, or raw
// command output), which otherwise fails the whole TranscriptEntry write and kills the run.
function stripNul(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(/\u0000/g, '')
  if (Array.isArray(v)) return v.map(stripNul)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = stripNul(val)
    return out
  }
  return v
}

const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (stripNul(v) as Prisma.InputJsonValue))

/** The run's rows, in the order they happened; the reply and how the run ended come last. */
export function transcriptRowsOfRun(params: PersistRunOutputParams, now = new Date()): { rows: Row[]; finalReply: string | null } {
  const { sessionId, runId, streamed, resolvedModel, ending, summarise, personId } = params
  const finalReply = shapeAgentReply(streamed.fullReply)
  const rows: Row[] = []

  for (const [toolUseId, tc] of streamed.toolCallMap) {
    rows.push({
      sessionId, runId, role: 'TOOL', content: tc.toolName, toolName: tc.toolName, toolUseId,
      toolInput: json(tc.toolInput), toolOutput: json(tc.output ?? null),
      ...(tc.at ? { createdAt: tc.at } : {}),
    })
  }
  for (const t of streamed.thoughts ?? []) {
    if (t.text.trim()) rows.push({ sessionId, runId, role: 'SYSTEM', kind: 'THOUGHT', content: stripNul(t.text) as string, createdAt: t.at })
  }
  for (const c of streamed.compactions ?? []) {
    const detail: ContextSummarisedDetail = {
      trigger: c.trigger, summary: c.summary, tokensBefore: c.tokensBefore, byId: c.trigger === 'manual' ? personId ?? null : null,
    }
    rows.push({ sessionId, runId, role: 'SYSTEM', kind: 'CONTEXT_SUMMARISED', content: '', detail: json(detail), createdAt: c.at })
  }

  if (finalReply) {
    rows.push({
      sessionId, runId, role: 'ASSISTANT', content: finalReply,
      model: streamed.usedModel ?? resolvedModel,
      thought: streamed.accumulatedThought || null,
      thinkingDurationMs: streamed.accThinkingMs > 0 ? streamed.accThinkingMs : null,
      usage: streamed.runUsage ? (streamed.runUsage as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      createdAt: now,
    })
  }

  if (ending.kind === 'failed') {
    const detail: RunFailedDetail = { reason: ending.reason, ...(ending.resource ? { resource: ending.resource } : {}) }
    rows.push({ sessionId, runId, role: 'SYSTEM', kind: 'RUN_FAILED', content: ending.reason, detail: json(detail), createdAt: now })
  } else if (ending.kind === 'stopped') {
    const detail: RunStoppedDetail = { cause: ending.cause, by: ending.by }
    rows.push({ sessionId, runId, role: 'SYSTEM', kind: 'RUN_STOPPED', content: '', detail: json(detail), createdAt: now })
  } else if (!finalReply && rows.length === 0 && !summarise) {
    // Agent produced no text and did nothing — say so, so the person isn't
    // left with a silent empty response.
    logger.warn(`Run ${runId} produced no reply and no tool calls.`)
    rows.push({ sessionId, runId, role: 'ASSISTANT', content: NO_REPLY_TEXT, createdAt: now })
  }
  return { rows, finalReply }
}

export async function persistRunOutput(
  params: PersistRunOutputParams,
): Promise<{ finalReply: string | null; auditSummary: AuditSummary }> {
  // 7. Persist transcript
  const { rows, finalReply } = transcriptRowsOfRun(params)
  if (rows.length > 0) await prisma.transcriptEntry.createMany({ data: rows })

  // 8. Assemble audit summary from ToolCallLog rows for this run
  const toolCallLogs = await prisma.toolCallLog.findMany({ where: { runId: params.runId } })
  const auditSummary: AuditSummary = {
    totalCalls: toolCallLogs.length,
    blocked: toolCallLogs.filter(l => l.blocked).length,
    bySeverity: {
      SAFE:    toolCallLogs.filter(l => l.riskLevel === 'SAFE').length,
      LOW:     toolCallLogs.filter(l => l.riskLevel === 'LOW').length,
      MEDIUM:  toolCallLogs.filter(l => l.riskLevel === 'MEDIUM').length,
      HIGH:    toolCallLogs.filter(l => l.riskLevel === 'HIGH').length,
      FLAGGED: toolCallLogs.filter(l => l.riskLevel === 'FLAGGED').length,
    },
    flagged: toolCallLogs
      .filter(l => l.riskLevel === 'FLAGGED' || l.blocked)
      .map(l => ({
        toolName: l.toolName,
        command: (l.toolInput as { command?: string } | null)?.command,
        reason: l.blockReason ?? l.riskLevel,
      })),
  }

  return { finalReply, auditSummary }
}
