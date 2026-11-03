/**
 * Tool permission utilities
 * =========================
 * Helpers for the always / ask / never three-state tool permission model.
 *
 * - Coerce legacy string[] DB values to ToolPermission[] / BashPatternPermission[]
 * - Compute DEFAULT_TOOL_PERMISSIONS (used when agent.allowedTools is null)
 * - mergeWithAlwaysInjected: pin always-injected tools to 'always' regardless of config
 * - getToolState: look up a tool's effective state from a permission list
 */
import type { ToolPermission, BashPatternPermission, ToolPermissionState, RunContext } from './types'
import {
  ALWAYS_INJECTED_MCP_TOOLS,
  DEFAULT_ON_MCP_TOOLS,
  ADMINISTRATIVE_MCP_TOOLS,
} from '../../shared/mcpTools'
import { DEFAULT_RUNTIME_TOOLS, RUNTIME_TOOLS } from '../../shared/runtimeTools'

// ── Default permission set ────────────────────────────────────────────────────

/**
 * Effective permissions when agent.allowedTools is null ("use defaults").
 * Matches the pre-three-state defaults: filesystem always-on, web/bash never,
 * always-injected + default-on MCP always-on, administrative MCP never.
 */
export const DEFAULT_TOOL_PERMISSIONS: ToolPermission[] = [
  // Filesystem tools — always on by default
  ...DEFAULT_RUNTIME_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  // Bash + web — never by default (must be explicitly granted)
  { name: RUNTIME_TOOLS.BASH.BASH,     state: 'never' as const },
  { name: RUNTIME_TOOLS.WEB.WEB_FETCH,  state: 'never' as const },
  { name: RUNTIME_TOOLS.WEB.WEB_SEARCH, state: 'never' as const },
  // Always-injected MCP tools — on unless a mounted workspace's §H6 cap narrows
  // them (see mergeWithAlwaysInjected below for the agent-config-vs-workspace-cap split)
  ...ALWAYS_INJECTED_MCP_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  // Default-on MCP tools — always on when null
  ...DEFAULT_ON_MCP_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  // Administrative MCP tools — never by default
  ...ADMINISTRATIVE_MCP_TOOLS.map(n => ({ name: n, state: 'never' as const })),
]


// ── Coercion helpers ──────────────────────────────────────────────────────────

/**
 * Normalise the DB value of agent.allowedTools to ToolPermission[].
 * Handles both old string[] format and new ToolPermission[] format.
 * Legacy string[] entries → each gets state 'always' (they were pre-approved).
 * Null/undefined → returns defaults.
 */
export function coerceToolPermissions(
  raw: unknown,
  defaults: ToolPermission[] = DEFAULT_TOOL_PERMISSIONS,
): ToolPermission[] {
  if (raw === null || raw === undefined) return defaults
  if (!Array.isArray(raw)) return defaults
  if (raw.length === 0) return []

  // Detect new format: first element has a 'state' property
  if (typeof raw[0] === 'object' && raw[0] !== null && 'state' in raw[0]) {
    return raw as ToolPermission[]
  }

  // Old format: string[] — treat each as 'always' (backward compat)
  return (raw as string[]).map(name => ({ name, state: 'always' as const }))
}

/**
 * Normalise the DB value of agent.allowedBashPatterns to BashPatternPermission[].
 * Legacy string[] entries → each gets state 'always'.
 * Null/undefined → empty array (no bash patterns approved by default).
 */
export function coerceBashPatternPermissions(
  raw: unknown,
): BashPatternPermission[] {
  if (raw === null || raw === undefined) return []
  if (!Array.isArray(raw)) return []
  if (raw.length === 0) return []

  if (typeof raw[0] === 'object' && raw[0] !== null && 'state' in raw[0]) {
    return raw as BashPatternPermission[]
  }

  return (raw as string[]).map(pattern => ({ pattern, state: 'always' as const }))
}

// ── Always-injected pin ───────────────────────────────────────────────────────

/**
 * Ensure always-injected MCP tools are pinned to 'always', regardless of
 * what the agent config says. Called after coercion before building the context.
 *
 * This pin defeats AGENT-CONFIG downgrades only. It runs before the mint's §H6
 * workspace-cap intersection (capabilityService.ts), which deliberately still
 * narrows these same tools to 'never' when a mounted workspace's allowedTools
 * omits them — that intersection is absolute by design (spec §H6: a layer that
 * could override another could widen; the cap is a data-protection boundary,
 * not a permission the agent config gets to out-rank).
 */
export function mergeWithAlwaysInjected(permissions: ToolPermission[]): ToolPermission[] {
  const injectedSet = new Set(ALWAYS_INJECTED_MCP_TOOLS)
  // Remove any existing entries for always-injected tools, then re-add pinned
  const base = permissions.filter(p => !injectedSet.has(p.name))
  return [
    ...base,
    ...ALWAYS_INJECTED_MCP_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  ]
}

// ── State lookup ──────────────────────────────────────────────────────────────

/**
 * Return the effective ToolPermissionState for a given tool name.
 * If permissions is undefined (approval bypassed), returns 'always'.
 * If a tool is not in the list, defaults to 'ask' (unknown = require approval).
 */
export function getToolState(
  toolName: string,
  permissions: ToolPermission[] | undefined,
): ToolPermissionState {
  if (!permissions) return 'always' // bypassed
  const entry = permissions.find(p => p.name === toolName)
  return entry?.state ?? 'ask'
}

// ── Runs nobody can approve ───────────────────────────────────────────────────

type UnattendedContext = Pick<RunContext, 'bypassed' | 'allowedTools' | 'allowedBashPatterns' | 'approvedManifest'>

/**
 * A run with no approved manifest has nobody to approve an
 * `ask` call, so a restricted agent's `ask` tools and commands are refused in
 * it (toolGate.ts) and hidden from its model, as `never` ones are in every run.
 * Chat and task runs always carry a manifest, so they are never unattended.
 */
export function runIsUnattended(context: Pick<RunContext, 'approvedManifest'>): boolean {
  return !context.approvedManifest
}

/** The tools among `names` a restricted agent has in state `ask`, when its run is unattended; none otherwise. */
export function unattendedAskTools(context: UnattendedContext, names: Iterable<string>): string[] {
  if (context.bypassed || !context.allowedTools || !runIsUnattended(context)) return []
  return [...names].filter(name => getToolState(name, context.allowedTools) === 'ask')
}

/**
 * Whether a restricted agent's built-in is refused on every call of this run:
 * `never`, or `ask` in an unattended run. Bash counts only when no command can
 * run — unattended, a command runs when an `always` pattern matches it, or when
 * bash itself is `always` and no pattern matches it.
 */
export function builtinWithheld(name: string, context: UnattendedContext): boolean {
  if (context.bypassed || !context.allowedTools) return false
  const state = getToolState(name, context.allowedTools)
  if (state === 'never') return true
  if (!runIsUnattended(context)) return false
  if (name === RUNTIME_TOOLS.BASH.BASH) return state !== 'always' && !(context.allowedBashPatterns ?? []).some(p => p.state === 'always')
  return state === 'ask'
}

// ── Write-tool detection (spec §6.4) ──────────────────────────────────────────

/**
 * The runtime built-in tools that can modify mounted files. Exported so
 * `hq/src/agents/toolPermissions.ts`'s own pinned copy — needed there at MINT
 * time, not just at this runtime's per-call gate, and the two apps never import
 * from each other (see that file's own doc comment) — can be drift-checked
 * against this one. The check is `__tests__/toolPermissions.drift.test.ts`
 * beside this file and its hq twin; never edit this array without the other.
 */
export const WRITE_TOOLS = [
  RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE,
  RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE,
  RUNTIME_TOOLS.BASH.BASH,
] as const

export interface RunWritePermissions {
  bypassed: boolean
  allowedTools: ToolPermission[] | null | undefined
  neverTools: string[] | null | undefined
}

/**
 * Whether a run's effective toolset includes any tool that can modify mounted
 * files. When false, prepareAgentContainer (containerPrep.ts) binds every
 * work-location mount read-only so the kernel enforces what the registry
 * refuses — spec §6.4, closing the 5b-1 gap where approval: 'bypassed'
 * bypassed the §H6 intersection for the runtime built-ins (buildSdkBuiltinTools,
 * sdkNames.ts, deliberately grants those agents every built-in — MCP tools alone
 * were bound by the intersection). neverTools is the hard deny derived AFTER
 * the intersection (capabilityService.ts), so it binds even bypassed agents:
 * checked FIRST, ahead of the bypassed short-circuit, so a workspace cap
 * that denies a write tool always wins.
 *
 * Deliberately does NOT go through getToolState for the restricted branch:
 * getToolState defaults an entry absent from allowedTools to 'ask' (documented
 * as "unknown tool — require approval"), which is the right default for live
 * per-call gating but wrong here — capabilityService's mint stores whatever
 * agent.allowedTools resolves to via coerceToolPermissions, which returns a
 * non-null DB value AS-IS with no merge against DEFAULT_TOOL_PERMISSIONS (see
 * that function's doc comment), so a restricted agent's list can genuinely omit
 * write_file/edit_file/bash entirely. Treating that omission as 'ask' would
 * make "only read tools configured" register as write-capable and skip the
 * read-only mount — the opposite of the conservative default this function
 * exists to provide. So an absent entry here means "not granted", full stop.
 *
 * Safe precisely because buildSdkBuiltinTools' restricted branch is an
 * allowlist over entries PRESENT in allowedTools (sdkNames.ts) — a write tool
 * absent from the list is never registered with the SDK, so getToolState's
 * 'ask' default cannot fire for it and no approved write can meet a read-only
 * mount. If that allowlist shape ever changed to register absent tools too,
 * this function's absent-means-not-granted stance would need revisiting
 * alongside it.
 */
export function runHasWriteTools(p: RunWritePermissions): boolean {
  return WRITE_TOOLS.some(tool => {
    if (p.neverTools?.includes(tool)) return false
    if (p.bypassed) return true
    const entry = p.allowedTools?.find(perm => perm.name === tool)
    return entry?.state === 'always' || entry?.state === 'ask'
  })
}
