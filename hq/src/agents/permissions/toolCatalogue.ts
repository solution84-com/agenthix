/**
 * Every tool an agent's permissions can name, in the groups the permissions view shows them in: Files, Commands,
 * Web and Platform. The always-injected platform tools are fixed — every agent has them at Always.
 */
import { RUNTIME_TOOLS } from '../../shared/runtimeTools'
import { ALL_SYSTEM_MCP_TOOL_NAMES, ALWAYS_INJECTED_MCP_TOOLS } from '../../shared/mcpTools'

export type ToolGroup = 'files' | 'commands' | 'web' | 'platform'
export const TOOL_GROUPS: readonly ToolGroup[] = ['files', 'commands', 'web', 'platform']

export type CatalogueTool = { name: string; group: ToolGroup; fixed: boolean }

const FIXED = new Set(ALWAYS_INJECTED_MCP_TOOLS)

export const EVERY_TOOL: readonly CatalogueTool[] = [
  ...Object.values(RUNTIME_TOOLS.FILESYSTEM).map(name => ({ name, group: 'files' as const, fixed: false })),
  { name: RUNTIME_TOOLS.BASH.BASH, group: 'commands', fixed: false },
  ...Object.values(RUNTIME_TOOLS.WEB).map(name => ({ name, group: 'web' as const, fixed: false })),
  ...[...ALL_SYSTEM_MCP_TOOL_NAMES].map(name => ({ name, group: 'platform' as const, fixed: FIXED.has(name) })),
]

const BY_NAME = new Map(EVERY_TOOL.map(t => [t.name, t]))

export function catalogueTool(name: string): CatalogueTool | undefined {
  return BY_NAME.get(name)
}

/** A built-in tool (files, commands, web), as opposed to a platform tool. */
export function isBuiltinTool(name: string): boolean {
  const group = BY_NAME.get(name)?.group
  return group !== undefined && group !== 'platform'
}
