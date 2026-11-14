/**
 * Tool permission utilities — trimmed survivor of `agents/runtime/toolPermissions.ts`.
 * The per-call gating helpers (`getToolState`, `getBashPatternState`,
 * `runHasWriteTools`) moved to site with the execution-layer refactoring — they had
 * no caller left on hq once ChatRunner/sdkToolGate moved. `coerceToolPermissions`,
 * `coerceBashPatternPermissions` and `mergeWithAlwaysInjected` stayed: hq still models tool permissions at
 * rest (agent CRUD, zip import/export, capability minting).
 */
import type { ToolPermission, BashPatternPermission } from '@agenthix/core'
import {
  ALWAYS_INJECTED_MCP_TOOLS,
  DEFAULT_ON_MCP_TOOLS,
  ADMINISTRATIVE_MCP_TOOLS,
} from '../shared/mcpTools'
import { DEFAULT_RUNTIME_TOOLS, RUNTIME_TOOLS } from '../shared/runtimeTools'

// ── Default permission set ────────────────────────────────────────────────────

/**
 * Effective permissions when agent.allowedTools is null ("use defaults").
 * Filesystem always-on, bash never, web ask (a person approves each fetch and
 * search), always-injected + default-on MCP always-on, administrative MCP never.
 * Read at run time, so a change here reaches every agent that saved no list.
 */
export const DEFAULT_TOOL_PERMISSIONS: ToolPermission[] = [
  // Filesystem tools — always on by default
  ...DEFAULT_RUNTIME_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  // Bash — never by default (must be explicitly granted)
  { name: RUNTIME_TOOLS.BASH.BASH,     state: 'never' as const },
  // Web — ask by default: a page read can steer an agent, so a person approves each use unless an admin says Always
  { name: RUNTIME_TOOLS.WEB.WEB_FETCH,  state: 'ask' as const },
  { name: RUNTIME_TOOLS.WEB.WEB_SEARCH, state: 'ask' as const },
  // Always-injected MCP tools — on unless a mounted workspace's §H6 cap narrows
  // them (see mergeWithAlwaysInjected below for the agent-config-vs-workspace-cap split)
  ...ALWAYS_INJECTED_MCP_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  // Default-on MCP tools — always on when null
  ...DEFAULT_ON_MCP_TOOLS.map(n => ({ name: n, state: 'always' as const })),
  // Administrative MCP tools — never by default
  ...ADMINISTRATIVE_MCP_TOOLS.map(n => ({ name: n, state: 'never' as const })),
]

// ── Write-tool set (spec §6.4) ────────────────────────────────────────────────

/**
 * The runtime built-in tools that can modify mounted files. Pinned copy of
 * site's own `WRITE_TOOLS` (site/src/agents/runtime/toolPermissions.ts) —
 * hq needs this at MINT time (capabilityService.ts's bypassed-omission
 * seed below, SC-352), not just at the runtime's per-call gate, and the two
 * apps never import from each other.
 */
export const WRITE_TOOLS = [
  RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE,
  RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE,
  RUNTIME_TOOLS.BASH.BASH,
] as const


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
