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
import type { ToolPermission, BashPatternPermission, ToolPermissionState } from './permissionTypes'
import {
  ALWAYS_INJECTED_MCP_TOOLS,
  DEFAULT_ON_MCP_TOOLS,
  ADMINISTRATIVE_MCP_TOOLS,
} from './mcpTools'
import { DEFAULT_RUNTIME_TOOLS, RUNTIME_TOOLS } from './runtimeTools'

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
  // Always-injected MCP tools — always on (required for basic agent operation)
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
  if (!permissions) return 'always' // approval bypassed
  const entry = permissions.find(p => p.name === toolName)
  return entry?.state ?? 'ask'
}

/**
 * Return the effective ToolPermissionState for a bash command.
 * Matches against the first pattern where pattern === '*' or cmd starts with pattern.
 * If no pattern matches, returns 'ask' (unmatched commands require approval).
 */
export function getBashPatternState(
  cmd: string,
  patterns: BashPatternPermission[],
): ToolPermissionState {
  const match = patterns.find(
    p => p.pattern.trim() === '*' || cmd.startsWith(p.pattern.trim()),
  )
  return match?.state ?? 'ask'
}
