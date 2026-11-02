/**
 * The tools a run on a branch's copy has (live preview spec, *Commits, and the branch coming back*), built from
 * core's declarations as the workflow tools are, and forwarded to hq like them. Each acts for the calling run, whose
 * id the site fills in; hq finds the branch and its copy from the run, never from anything the agent says. Offered
 * only to a run on a code workspace (`mcpServer.ts`).
 */
import { COMMIT_TOOL_DECLARATION, MERGE_TOOL_DECLARATION, UPDATE_TOOL_DECLARATION, type ToolPermission } from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'
import { forwardedFromDeclaration } from './forwardedWorkflowSchemas'

export const FORWARDED_CODE_TOOLS: ForwardedTool[] = [COMMIT_TOOL_DECLARATION, MERGE_TOOL_DECLARATION, UPDATE_TOOL_DECLARATION].map(forwardedFromDeclaration)

export const CODE_TOOL_NAME_SET: ReadonlySet<string> = new Set(FORWARDED_CODE_TOOLS.map(t => t.name))

/**
 * A run on a branch's copy has its code tools without asking: `commit` and `update_from_main` write only that
 * copy's branch, and `merge_into_main` only asks the person, whose own press merges. They are in no agent's access settings, so an agent
 * whose other tools wait for approval would otherwise have them waiting too.
 */
export function withCodeWorkTools(permissions: ToolPermission[]): ToolPermission[] {
  return [
    ...permissions.filter(p => !CODE_TOOL_NAME_SET.has(p.name)),
    ...[...CODE_TOOL_NAME_SET].map(name => ({ name, state: 'always' as const })),
  ]
}
