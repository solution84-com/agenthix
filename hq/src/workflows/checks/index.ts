/**
 * The plain checks (workflows spec part 1, *R1 · Plain checks*): rules with no model, run by hq on a version as it is
 * proposed, against the approved version. Each match is a flag on the approval card; together they write the
 * card's one-line summary and decide whether the card may offer Approve. Pure: the caller reads the versions.
 *
 * Refused outright rather than flagged, and so not here: a variable named after one that changes how programs run,
 * and a link among the files — the definition's parser and the site refuse those before a version exists.
 */
import type { WorkflowCheckFlag, WorkflowVersionContent } from '@agenthix/core'
import { cardDecision, type CardDecision } from './card'
import type { GitHubCeiling } from './flag'
import { githubPermissionChecks, unlistedHosts, unpinnedInstalls } from './networkRules'
import { dashParameters, destructiveCommands, newSinceApproved, textParameterUse } from './otherRules'
import { secretGitInWorkspace, secretHandsOn, secretOutput, secretRunsWorkspace, secretSteps } from './secretRules'
import { allCode } from './code'
import { cardSummary } from './summary'

export type { GitHubCeiling } from './flag'
export type { CardDecision } from './card'

export type PlainChecks = { flags: WorkflowCheckFlag[]; summary: string; card: CardDecision }

export type ApprovedForChecks = { number: number; content: WorkflowVersionContent } | null

export function checkFlags(content: WorkflowVersionContent, approved: WorkflowVersionContent | null, ceiling: GitHubCeiling): WorkflowCheckFlag[] {
  const flags = [
    ...secretOutput(allCode(content)),
    ...unlistedHosts(content),
    ...textParameterUse(content),
    ...unpinnedInstalls(content),
    ...secretSteps(content),
    ...githubPermissionChecks(content, approved, ceiling),
    ...destructiveCommands(content),
    ...newSinceApproved(content, approved),
    ...secretRunsWorkspace(content),
    ...secretGitInWorkspace(content),
    ...dashParameters(content),
    ...secretHandsOn(content),
  ]
  const seen = new Set<string>()
  return flags
    .filter((f) => { const k = JSON.stringify(f); if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.rule - b.rule || Number(b.high) - Number(a.high))
}

export function runPlainChecks(content: WorkflowVersionContent, approved: ApprovedForChecks, ceiling: GitHubCeiling): PlainChecks {
  const flags = checkFlags(content, approved?.content ?? null, ceiling)
  return { flags, summary: cardSummary(content, approved), card: cardDecision(content, approved?.content ?? null, flags) }
}
