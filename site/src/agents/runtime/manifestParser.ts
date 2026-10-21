/**
 * Utilities for the manifest declaration in agent output
 * and for building the ApprovedManifest that is stored on AgentRun.
 *
 * The agent outputs a tagged JSON block:
 *   <manifest>{ ... }</manifest>
 *
 * Pure functions — no Prisma, no side effects.
 */
import type { ApprovedManifest, ManifestRequest } from './types'

const MANIFEST_OPEN  = '<manifest>'

/**
 * Extract the agent's summary text — everything before the <manifest> tag, trimmed.
 * Returns null if there's no text before the manifest (or no manifest at all).
 */
export function parseSummaryFromOutput(output: string): string | null {
  const start = output.indexOf(MANIFEST_OPEN)
  if (start === -1) return null
  const before = output.slice(0, start).trim()
  return before.length > 0 ? before : null
}

/**
 * True when the agent has requested tools or bash patterns beyond its baseline.
 * When false, no HITL gate is needed — the run starts immediately.
 */
export function manifestNeedsApproval(request: ManifestRequest): boolean {
  return request.extendedTools.length > 0 || request.extendedBashPatterns.length > 0
}

/**
 * Merge the baseline tools/patterns with the approved extended items into
 * an ApprovedManifest that is passed to the SDK at launch and enforced
 * by PreToolUse during the run.
 */
export function buildApprovedManifest(
  base: { tools: string[]; bashPatterns: string[] },
  request: ManifestRequest,
): ApprovedManifest {
  return {
    tools: [...base.tools, ...request.extendedTools.map(e => e.name)],
    bashPatterns: [...base.bashPatterns, ...request.extendedBashPatterns.map(e => e.pattern)],
    approvedAt: new Date().toISOString(),
  }
}
