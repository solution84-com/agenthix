/**
 * What the permissions screens show (every screen reviewed spec §3, *An agent's permissions*): one view at every
 * level. The organisation's is the agent's own; a project's or a person's shows, for each tool, bash pattern and
 * approval, the organisation's setting, this level's, the one that takes effect and whether it is narrowed here.
 * Pure — the operations in permissionQueries.ts read the rows.
 */
import { APPROVALS, type Approval, type ToolPermissionState } from '@agenthix/core'
import { coerceBashPatternPermissions, coerceToolPermissions, mergeWithAlwaysInjected } from '../toolPermissions'
import type { AgentOverrideValues } from '../overrides/agentOverrideService'
import { isStricterState, organisationPatterns, patternStateAt, stricterApproval, stricterState, type OrganisationPermissions } from './effectivePermissions'
import { EVERY_TOOL, TOOL_GROUPS, isBuiltinTool, type ToolGroup } from './toolCatalogue'

export type GroupSummary = { group: ToolGroup; always: number; ask: number; never: number }

export type OrganisationPermissionsView = {
  approval: Approval
  /** Every tool, its group and its state. `fixed` tools are always available and cannot be changed. */
  tools: { name: string; group: ToolGroup; fixed: boolean; state: ToolPermissionState }[]
  bashPatterns: { pattern: string; state: ToolPermissionState }[]
  /** Per group, how many of its changeable tools are at each state. */
  summary: GroupSummary[]
}

/** One line of a narrowing: the organisation's setting, this level's (null when it sets none), and what takes effect. */
export type NarrowedLine = {
  organisation: ToolPermissionState
  here: ToolPermissionState | null
  effective: ToolPermissionState
  /** This level makes it stricter than the organisation's, and that takes effect. */
  narrowed: boolean
}

export type PermissionsHereView = {
  approval: { organisation: Approval; here: Approval | null; effective: Approval; narrowed: boolean }
  /** The organisation bypasses approval: its tools count as every tool Always, and its saved list is not used. */
  organisationBypassed: boolean
  tools: ({ name: string; group: ToolGroup; fixed: boolean } & NarrowedLine)[]
  /** The organisation's patterns in its order, then the ones only this level names. */
  bashPatterns: ({ pattern: string } & NarrowedLine)[]
  /** How many tools, patterns and approval this level narrows, counting only what takes effect. */
  narrowedCount: number
}

/**
 * The organisation's state for each tool, as a run sees it: its saved list (or the defaults), with a tool the list
 * leaves out unavailable if it is a built-in — the harness never offers it — and asked about if it is a platform tool.
 */
function organisationToolStates(org: OrganisationPermissions): Map<string, ToolPermissionState> {
  const saved = new Map(mergeWithAlwaysInjected(coerceToolPermissions(org.allowedTools)).map(p => [p.name, p.state]))
  return new Map(EVERY_TOOL.map(t => [t.name, saved.get(t.name) ?? (isBuiltinTool(t.name) ? 'never' : 'ask')]))
}

export function organisationView(org: OrganisationPermissions): OrganisationPermissionsView {
  const states = organisationToolStates(org)
  const tools = EVERY_TOOL.map(t => ({ ...t, state: states.get(t.name)! }))
  const summary = TOOL_GROUPS.map(group => {
    const counts: GroupSummary = { group, always: 0, ask: 0, never: 0 }
    for (const t of tools) if (t.group === group && !t.fixed) counts[t.state] += 1
    return counts
  })
  const bashPatterns = coerceBashPatternPermissions(org.allowedBashPatterns).map(p => ({ pattern: p.pattern, state: p.state }))
  return { approval: org.approval, tools, bashPatterns, summary }
}

function line(organisation: ToolPermissionState, here: ToolPermissionState | null, applies: boolean): NarrowedLine {
  const effective = here ? stricterState(organisation, here) : organisation
  return { organisation, here, effective, narrowed: applies && here !== null && isStricterState(here, organisation) }
}

export function narrowingView(org: OrganisationPermissions, narrowing: AgentOverrideValues | null): PermissionsHereView {
  const here = narrowing?.approval ?? null
  const effectiveApproval = stricterApproval(org.approval, here)
  // While the run is bypassed nothing below takes effect, so nothing below is counted as narrowed.
  const applies = effectiveApproval !== 'bypassed'
  const organisationBypassed = org.approval === 'bypassed'
  const orgStates = organisationToolStates(org)
  const hereTools = new Map((narrowing?.allowedTools ?? []).map(p => [p.name, p.state]))
  const tools = EVERY_TOOL.map(t => ({
    ...t,
    ...line(organisationBypassed ? 'always' : orgStates.get(t.name)!, t.fixed ? null : hereTools.get(t.name) ?? null, applies),
  }))

  const orgPatterns = organisationPatterns(org)
  const herePatterns = new Map((narrowing?.allowedBashPatterns ?? []).map(p => [p.pattern.trim(), p.state]))
  const names = [...new Set([...orgPatterns.patterns.map(p => p.pattern.trim()), ...herePatterns.keys()])]
  const bashPatterns = names.map(pattern => ({
    pattern,
    ...line(patternStateAt(orgPatterns.patterns, pattern, orgPatterns.unmatched), herePatterns.get(pattern) ?? null, applies),
  }))

  const approvalNarrowed = here !== null && APPROVALS.indexOf(here) > APPROVALS.indexOf(org.approval)
  const narrowedCount = (approvalNarrowed ? 1 : 0) + tools.filter(t => t.narrowed).length + bashPatterns.filter(p => p.narrowed).length
  return {
    approval: { organisation: org.approval, here, effective: effectiveApproval, narrowed: approvalNarrowed },
    organisationBypassed,
    tools,
    bashPatterns,
    narrowedCount,
  }
}
