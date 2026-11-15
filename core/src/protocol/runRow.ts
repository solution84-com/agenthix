/**
 * A run's row and its token usage, as `run.get` and `run.list` serve them. Split out of `runtimeData.ts` when that
 * file passed the repository's size limit; `runtimeData.ts` re-exports these names.
 */
import type { RunSkillUse } from './packages.js'
import type { ApprovedManifest, AuditSummary, PendingManifest } from './runManifest.js'
import type { JsonValue } from '../client/json.js'
import type { ContextUse } from './contextUse.js'

/**
 * Copied from hq/src/shared/utils/aiMetrics.ts's `TokenUsage` — moved into
 * core so the wire shape isn't duplicated; aiMetrics.ts now re-exports this
 * one instead of declaring its own.
 */
export type TokenUsage = {
  /** Fresh (non-cached) input tokens. */
  inputTokens: number
  outputTokens: number
  /** Tokens read from prompt cache. Omit or set 0 if provider does not cache. */
  cacheReadTokens?: number
  /** Tokens written to prompt cache. Omit or set 0 if provider does not cache. */
  cacheWriteTokens?: number
  /** Total processed tokens = input + cacheRead + cacheWrite + output. Used for env estimates. */
  totalTokens: number
}

/** Row types served by run.get / run.list / transcript.list / toolcall.list. */
export type RunRow = {
  id: string
  agentId: string
  sessionId: string
  taskId: string | null
  /** The routine whose firing started it (adr-0177); null for a task's run or a reply. ABSENT from a site before 1.15. */
  routineId?: string | null
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  inputText: string
  outputText: string | null
  model: string
  error: string | null
  usage: TokenUsage | null
  /** `SUPERSEDED`: the request was replaced by something newer in its task or conversation. */
  manifestStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | null
  /** What a deferred run asks to be approved for; null when it asked for nothing. */
  pendingManifest: PendingManifest | null
  /** What the run was approved for; null when it ran on its own permissions. */
  approvedManifest: ApprovedManifest | null
  /** hq's id of the person who approved or denied the request; null when undecided or when no person is known. */
  manifestDecidedById: string | null
  /** When the request was approved, denied, or replaced by something newer; null while undecided. */
  manifestDecidedAt: string | null
  /** The runtime's memory of the conversation as this run left it (`contextUse.ts`); null when it reported none. */
  contextUse: ContextUse | null
  /** Written when the run ends; null before then. */
  auditSummary: AuditSummary | null
  /** The run's own notes (what started it, for whom), arbitrary JSON by design. */
  metadata: JsonValue
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  /** The digest of each package's content the run loaded (ADR-0072); org is null before an org exists. */
  agentPackageDigest: string | null
  orgPackageDigest: string | null
  platformPackageDigest: string | null
  /** The skills the run had staged; null before it staged any. ABSENT from a site before 1.9. */
  skillsUsed?: RunSkillUse[] | null
}
