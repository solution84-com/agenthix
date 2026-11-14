/** The single place that knows Claude's tool naming scheme — canonical ↔ SDK translation. */
import { ALL_SYSTEM_MCP_TOOL_NAMES } from '../../shared/mcpTools'
import type { SystemMcpTool } from '../../shared/mcpTools'
import type { RunContext } from './types'
import { builtinWithheld, unattendedAskTools } from './toolPermissions'

export const MCP_SERVER_NAME = 'platform'

// ── Claude runtime tool name map ──────────────────────────────────────────────
// Maps our canonical runtime tool names to Claude SDK's built-in names and back.
// This is the only place in the codebase that knows about Claude's naming scheme
// for filesystem / bash / web tools.

const CLAUDE_RUNTIME_TOOL_MAP: Record<string, string> = {
  'read_file':  'Read',
  'write_file': 'Write',
  'edit_file':  'Edit',
  'glob_files': 'Glob',
  'grep_files': 'Grep',
  'bash':       'Bash',
  'web_fetch':  'WebFetch',
  'web_search': 'WebSearch',
}

const CLAUDE_RUNTIME_TOOL_MAP_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(CLAUDE_RUNTIME_TOOL_MAP).map(([k, v]) => [v, k]),
)

/**
 * SDK meta/interactive/CLI-specific tools that are always blocked.
 * Passed in disallowedTools on every run regardless of agent config.
 */
export const BLACKLISTED_SDK_TOOLS = [
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
  'CronCreate', 'CronDelete', 'CronList',
  'TeamCreate', 'TeamDelete',
]

/**
 * Environment every Claude harness process starts with, in a container or not.
 *
 * A subscription login brings the claude.ai connectors of the account behind it
 * (Drive, mail, and the like), which act with that person's authority. A run's
 * authority comes from its boundary (adr-0060), and a project's runs — tasks
 * included — must not reach one person's accounts, so the harness never loads
 * them. An agent then has the same tools whichever credential it runs on.
 */
export const HARNESS_ENV: Record<string, string> = {
  ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
}

/**
 * Claude's own to-do list, which every agent has: the agent's private checklist
 * for the conversation, not a platform task (spec, "Tool-name mapping").
 */
const HARNESS_TODO_TOOL = 'TodoWrite'

/**
 * Claude's tool that loads one of the turn's staged skills (adr-0084), which
 * every agent has: it reads only the site-made copies the run was started
 * with. Named `skill` in the gate and its log, as on OpenCode.
 */
export const HARNESS_SKILL_TOOL = 'Skill'
export const SKILL_TOOL = 'skill'

/** The staged skills' plugin (claude/claudeSkills.ts): Claude Code lists each skill as `agenthix:<name>`, and the model calls it by the bare name. */
export const SKILLS_PLUGIN_NAME = 'agenthix'

/**
 * All useful SDK built-in tools we expose to agents.
 * Used as the baseline for bypassed agents.
 */
const ALL_USEFUL_SDK_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'Agent', HARNESS_SKILL_TOOL,
]

/**
 * The SDK built-in tools an agent can see (the SDK `tools` whitelist).
 * - **bypassed**: the complete built-in set. neverTools must NOT prune it — for an
 *   bypassed agent neverTools comes from DEFAULT_TOOL_PERMISSIONS (allowedTools is null),
 *   which defaults bash to 'never'; subtracting that silently stripped Bash from the
 *   kernel (the smoke-test Finding 2 regression). neverTools still governs the MCP
 *   disallowedTools path separately.
 * - **restricted**: allowed always/ask-state built-ins, minus never-state, the to-do list and Skill.
 *   In a run with no manifest, ask-state ones go too: nobody can approve them (builtinWithheld).
 */
export function buildSdkBuiltinTools(
  context: Pick<RunContext, 'bypassed' | 'neverTools' | 'allowedTools' | 'allowedBashPatterns' | 'approvedManifest'>,
): string[] {
  const neverSdkSet = new Set(
    (context.neverTools ?? []).map(n => CLAUDE_RUNTIME_TOOL_MAP[n]).filter(Boolean) as string[],
  )
  if (context.bypassed) return ALL_USEFUL_SDK_TOOLS
  const granted = (context.allowedTools ?? [])
    .filter(p => p.state !== 'never' && CLAUDE_RUNTIME_TOOL_MAP[p.name] && !builtinWithheld(p.name, context))
    .map(p => CLAUDE_RUNTIME_TOOL_MAP[p.name])
    .filter(t => !neverSdkSet.has(t))
  return [...granted, HARNESS_TODO_TOOL, HARNESS_SKILL_TOOL]
}

/**
 * The SDK's `disallowedTools`: the meta tools, the never-state platform tools in
 * case a tools/list filter misses one, and — in a run with no manifest — the
 * ask-state platform tools, which nobody can approve there.
 */
export function buildSdkDisallowedTools(
  context: Pick<RunContext, 'bypassed' | 'neverTools' | 'allowedTools' | 'allowedBashPatterns' | 'approvedManifest'>,
): string[] {
  const never = (context.neverTools ?? []).filter(n => ALL_SYSTEM_MCP_TOOL_NAMES.has(n))
  const ask = unattendedAskTools(context, ALL_SYSTEM_MCP_TOOL_NAMES).filter(n => !never.includes(n))
  return [...BLACKLISTED_SDK_TOOLS, ...toSdkToolNames([...never, ...ask])]
}

/** Convert a raw MCP tool name to Claude's mcp__<server>__<tool> format. */
export function toSdkToolName(tool: SystemMcpTool): string {
  return `mcp__${MCP_SERVER_NAME}__${tool}`
}

/**
 * Translate a Claude SDK tool name back to our canonical name.
 * Handles MCP tools (mcp__platform__<tool>), runtime tools (Read → read_file) and Skill → skill.
 * Returns null if the name isn't one we own.
 */
export function fromSdkToolName(sdkName: string): string | null {
  const prefix = `mcp__${MCP_SERVER_NAME}__`
  if (sdkName.startsWith(prefix)) return sdkName.slice(prefix.length)
  if (sdkName === HARNESS_SKILL_TOOL) return SKILL_TOOL
  return CLAUDE_RUNTIME_TOOL_MAP_REVERSE[sdkName] ?? null
}

/**
 * Translate our canonical tool names to the format the Claude SDK expects.
 * MCP tools → mcp__platform__<tool>; runtime tools → Read / Bash / etc.
 * Unknown names pass through unchanged.
 */
export function toSdkToolNames(tools: string[]): string[] {
  return tools.map(t =>
    ALL_SYSTEM_MCP_TOOL_NAMES.has(t)
      ? toSdkToolName(t as SystemMcpTool)
      : (CLAUDE_RUNTIME_TOOL_MAP[t] ?? t),
  )
}
