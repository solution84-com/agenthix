/**
 * The tools a run on a branch's copy has (live preview spec, *Commits, and the branch coming back*), built from
 * core's declarations as the workflow tools are, and forwarded to hq like them. Each acts for the calling run, whose
 * id the site fills in; hq finds the branch and its copy from the run, never from anything the agent says. Offered
 * only to a run on a code workspace (`mcpServer.ts`).
 */
import { COMMIT_TOOL_DECLARATION, MERGE_TOOL_DECLARATION, UPDATE_TOOL_DECLARATION, type ToolPermission } from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'
import { forwardedFromDeclaration } from './forwardedWorkflowSchemas'
import { ASK_TO_USE_PACKAGE_TOOL, INSTALL_PACKAGES_TOOL } from './previewInstallTools'

export const FORWARDED_CODE_TOOLS: ForwardedTool[] = [COMMIT_TOOL_DECLARATION, MERGE_TOOL_DECLARATION, UPDATE_TOOL_DECLARATION].map(forwardedFromDeclaration)

export const CODE_TOOL_NAME_SET: ReadonlySet<string> = new Set(FORWARDED_CODE_TOOLS.map(t => t.name))

/**
 * A run on a branch's copy has its code tools without asking: `commit` and `update_from_main` write only that
 * copy's branch, and `merge_into_main` only asks the person, whose own press merges. They are in no agent's access settings, so an agent
 * whose other tools wait for approval would otherwise have them waiting too.
 */
/**
 * The package tools the site serves a run on a branch's copy itself (`previewInstallTools.ts`, adr-0170): installing
 * runs only the scripts that pass the rule, and asking only asks the person, so neither waits for approval either.
 */
export const SITE_CODE_TOOL_NAMES: readonly string[] = [INSTALL_PACKAGES_TOOL, ASK_TO_USE_PACKAGE_TOOL]

export function withCodeWorkTools(permissions: ToolPermission[]): ToolPermission[] {
  const names = new Set([...CODE_TOOL_NAME_SET, ...SITE_CODE_TOOL_NAMES])
  return [
    ...permissions.filter(p => !names.has(p.name)),
    ...[...names].map(name => ({ name, state: 'always' as const })),
  ]
}
