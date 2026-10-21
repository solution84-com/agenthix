/**
 * What a run records about the tools it asked for, was approved and called: the stored shapes `RunRow`,
 * `TranscriptApproval` and `RunStatusEvent` carry. The site writes each one (its runtime builds them); hq reads them
 * for the approval card, the run's page and the notification text.
 */

/** A deferred run's request: the tools and bash patterns it was refused and asks to be approved for its next run. */
export type PendingManifest = {
  tools: { name: string; reason?: string }[]
  bashPatterns: { pattern: string; reason?: string }[]
}

/** What the run was approved for, enforced during the run: the full tool set and bash patterns, and when. */
export type ApprovedManifest = {
  tools: string[]
  bashPatterns: string[]
  approvedAt: string
}

export type ToolCallRiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'FLAGGED'

/** Written when a run ends: how many tool calls it made, how many were blocked, and the risky ones. */
export type AuditSummary = {
  totalCalls: number
  blocked: number
  bySeverity: Record<ToolCallRiskLevel, number>
  flagged: { toolName: string; command?: string; reason: string }[]
}

/** A site-wide rule rating a tool call: a substring of a bash command, or a tool's exact name. */
export type RiskRule = {
  pattern: string
  riskLevel: ToolCallRiskLevel
}
