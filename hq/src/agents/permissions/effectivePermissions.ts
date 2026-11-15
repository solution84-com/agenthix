/**
 * What a run may do, resolved from every level that sets it (adr-0072): the organisation's — the agent's own —
 * then one narrowing, a project's for a run in that project or a person's for a run in their own Chat. For each
 * tool, each bash pattern and approval the strictest level wins: Always < Ask < Never, and
 * bypassed < deferred < immediate. A narrowing only ever takes away.
 *
 * Pure: the capability mint (capabilityService.ts) and the dispatch payload (runContext.ts) both resolve a run's
 * permissions through `resolveEffectivePermissions`, so the two cannot disagree.
 */
import {
  APPROVALS, type Approval, type BashPatternPermission, type CapabilityEffectivePermissions, type ToolPermission, type ToolPermissionState,
} from '@agenthix/core'
import { coerceBashPatternPermissions, coerceToolPermissions, mergeWithAlwaysInjected } from '../toolPermissions'
import { EVERY_TOOL, catalogueTool } from './toolCatalogue'
import { RUNTIME_TOOLS } from '../../shared/runtimeTools'

const STATE_RANK: Record<ToolPermissionState, number> = { always: 0, ask: 1, never: 2 }

export function stricterState(a: ToolPermissionState, b: ToolPermissionState): ToolPermissionState {
  return STATE_RANK[b] > STATE_RANK[a] ? b : a
}

export function isStricterState(candidate: ToolPermissionState, than: ToolPermissionState): boolean {
  return STATE_RANK[candidate] > STATE_RANK[than]
}

export function stricterApproval(base: Approval, narrowing: Approval | null | undefined): Approval {
  if (!narrowing) return base
  return APPROVALS.indexOf(narrowing) > APPROVALS.indexOf(base) ? narrowing : base
}

/** The organisation's level: the agent's own row, as stored. */
export type OrganisationPermissions = { approval: Approval; allowedTools: unknown; allowedBashPatterns: unknown }

/** A project's or a person's narrowing. Null fields leave the organisation's as they are. */
export type Narrowing = {
  approval: Approval | null
  allowedTools: ToolPermission[] | null
  allowedBashPatterns: BashPatternPermission[] | null
}

export const NO_NARROWING: Narrowing = { approval: null, allowedTools: null, allowedBashPatterns: null }

export type EffectivePermissions = {
  approval: Approval
  /**
   * Every tool's state. While bypassed, every tool at Always: no saved list applies, platform tools included, and
   * only the workspace cap narrows it (capabilityService.ts).
   */
  allowedTools: ToolPermission[]
  /**
   * Ordered for the gate's first-match reading: the most specific pattern first, a catch-all last. A command none
   * matches follows "Any other command", the bash tool's state in `allowedTools`.
   */
  allowedBashPatterns: BashPatternPermission[]
}

const EVERY_TOOL_ALWAYS = (): ToolPermission[] => EVERY_TOOL.map(t => ({ name: t.name, state: 'always' as const }))

/** The organisation's tools as a run sees them. While it bypasses, every tool counts as Always. */
export function organisationTools(org: OrganisationPermissions): ToolPermission[] {
  if (org.approval === 'bypassed') return EVERY_TOOL_ALWAYS()
  return mergeWithAlwaysInjected(coerceToolPermissions(org.allowedTools))
}

/**
 * The organisation's patterns, and what it gives a command none of them matches: "Any other command", its bash
 * tool's own state — Never when its list leaves bash out, since the harness then never offers it.
 */
export function organisationPatterns(org: OrganisationPermissions): { patterns: BashPatternPermission[]; unmatched: ToolPermissionState } {
  if (org.approval === 'bypassed') return { patterns: [], unmatched: 'always' }
  const bash = organisationTools(org).find(t => t.name === RUNTIME_TOOLS.BASH.BASH)?.state ?? 'never'
  return { patterns: coerceBashPatternPermissions(org.allowedBashPatterns), unmatched: bash }
}

const matchesAll = (pattern: string) => pattern === '*' || pattern === ''
const specificity = (pattern: string) => (matchesAll(pattern) ? -1 : pattern.length)

/**
 * The state one level's patterns give a command, read as the site's gate reads them: the first pattern that is a
 * catch-all or a prefix of the command decides. `unmatched` when none does — null for a narrowing, which has no
 * opinion about a command it does not name.
 */
export function patternStateAt<U extends ToolPermissionState | null>(
  patterns: BashPatternPermission[], command: string, unmatched: U,
): ToolPermissionState | U {
  const hit = patterns.find(p => matchesAll(p.pattern.trim()) || command.startsWith(p.pattern.trim()))
  return hit ? hit.state : unmatched
}

/**
 * The patterns' union, each at the strictest state any level gives it, longest first and a catch-all last.
 * The gate reads the first match, and the longest union pattern that prefixes a command is matched by exactly the
 * patterns at each level that match the command itself — so the gate's answer for every command is the strictest
 * level's answer for it. A command no union pattern matches follows the effective bash tool's state, which is
 * already the stricter of each level's "Any other command"; so no catch-all is added for it.
 */
function mergePatterns(
  org: { patterns: BashPatternPermission[]; unmatched: ToolPermissionState },
  narrowing: BashPatternPermission[],
): BashPatternPermission[] {
  const union = new Set([...org.patterns, ...narrowing].map(p => p.pattern.trim()).map(p => (p === '' ? '*' : p)))
  return [...union]
    .sort((a, b) => specificity(b) - specificity(a))
    .map(pattern => {
      const atOrg = patternStateAt(org.patterns, pattern, org.unmatched)
      const atNarrowing = patternStateAt(narrowing, pattern, null)
      return { pattern, state: atNarrowing ? stricterState(atOrg, atNarrowing) : atOrg }
    })
}

function mergeTools(org: ToolPermission[], narrowingTools: ToolPermission[]): ToolPermission[] {
  // The always-injected tools are fixed at every level, as they are at the organisation's.
  const narrowing = narrowingTools.filter(p => !catalogueTool(p.name)?.fixed)
  const narrowed = new Map(narrowing.map(p => [p.name, p.state]))
  const merged = org.map(p => {
    const here = narrowed.get(p.name)
    return here ? { name: p.name, state: stricterState(p.state, here) } : p
  })
  // A tool the organisation's list leaves out is not granted, so a narrowing can only add a Never for it.
  const present = new Set(org.map(p => p.name))
  const extraNevers = narrowing.filter(p => !present.has(p.name) && p.state === 'never')
  return [...merged, ...extraNevers.map(p => ({ name: p.name, state: 'never' as const }))]
}

export function resolveEffectivePermissions(org: OrganisationPermissions, narrowing: Narrowing | null): EffectivePermissions {
  const approval = stricterApproval(org.approval, narrowing?.approval)
  // Bypassed switches off the agent's own permissions for every tool: what it may still do in Agenthix is the
  // authority of the person the run is for, which hq's control-plane operations check.
  if (approval === 'bypassed') return { approval, allowedTools: EVERY_TOOL_ALWAYS(), allowedBashPatterns: [] }
  const tools = organisationTools(org)
  const patterns = organisationPatterns(org)
  if (!narrowing) {
    return { approval, allowedTools: tools, allowedBashPatterns: mergePatterns(patterns, []) }
  }
  return {
    approval,
    allowedTools: mergeTools(tools, narrowing.allowedTools ?? []),
    allowedBashPatterns: mergePatterns(patterns, narrowing.allowedBashPatterns ?? []),
  }
}

/**
 * Permissions shaped as a capability carries them, a run's or a turn's: a bypassed one lists no tools, and Never is
 * listed apart, since it binds even then. `tools` is the tool list after any narrowing the caller applies; `alsoNever`
 * adds tools withheld whatever the list says.
 */
export function capabilityPermissions(
  effective: EffectivePermissions, tools: ToolPermission[] = effective.allowedTools, alsoNever: readonly string[] = [],
): CapabilityEffectivePermissions {
  const bypassed = effective.approval === 'bypassed'
  return {
    bypassed,
    allowedTools: bypassed ? [] : tools,
    allowedBashPatterns: effective.allowedBashPatterns,
    neverTools: [...new Set([...tools.filter(p => p.state === 'never').map(p => p.name), ...alsoNever])],
  }
}
