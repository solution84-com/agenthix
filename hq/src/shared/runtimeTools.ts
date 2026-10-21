/**
 * Runtime tool registry
 * =====================
 * Canonical names for agent runtime capabilities (filesystem, bash, web).
 * Distinct from MCP tools — provided by the underlying agent runtime, not
 * the platform MCP server.
 *
 * The runtime layer translates these canonical names to whatever the
 * execution environment expects (e.g. 'Read' in Claude SDK).
 * See agents/runtime/sdkNames.ts for the Claude-specific mapping.
 */

// ── Tool registry (by domain) ─────────────────────────────────────────────────

export const RUNTIME_TOOLS = {

  /** Filesystem — read and write files in the agent's workspace. */
  FILESYSTEM: {
    READ_FILE:  'read_file',
    WRITE_FILE: 'write_file',
    EDIT_FILE:  'edit_file',
    GLOB_FILES: 'glob_files',
    GREP_FILES: 'grep_files',
  },

  /** Shell — execute commands in the agent's workspace. Double-gated by allowedBashPatterns. */
  BASH: {
    BASH: 'bash',
  },

  /** Web — fetch URLs and run web searches. */
  WEB: {
    WEB_FETCH:  'web_fetch',
    WEB_SEARCH: 'web_search',
  },

} as const

// ── Type ──────────────────────────────────────────────────────────────────────

export type RuntimeTool =
  | typeof RUNTIME_TOOLS.FILESYSTEM[keyof typeof RUNTIME_TOOLS.FILESYSTEM]
  | typeof RUNTIME_TOOLS.BASH[keyof typeof RUNTIME_TOOLS.BASH]
  | typeof RUNTIME_TOOLS.WEB[keyof typeof RUNTIME_TOOLS.WEB]

// ── Sets ──────────────────────────────────────────────────────────────────────

/** All canonical runtime tool names — used for lookup and translation. */
export const ALL_RUNTIME_TOOL_NAMES = new Set<string>([
  ...Object.values(RUNTIME_TOOLS.FILESYSTEM),
  RUNTIME_TOOLS.BASH.BASH,
  ...Object.values(RUNTIME_TOOLS.WEB),
])

// ── Access tier views ─────────────────────────────────────────────────────────

/**
 * Default runtime tools — filesystem only.
 * Included in the default tool set for all agents that don't specify allowedTools.
 */
export const DEFAULT_RUNTIME_TOOLS: string[] = [
  RUNTIME_TOOLS.FILESYSTEM.READ_FILE,
  RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE,
  RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE,
  RUNTIME_TOOLS.FILESYSTEM.GLOB_FILES,
  RUNTIME_TOOLS.FILESYSTEM.GREP_FILES,
]
