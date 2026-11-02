/**
 * The agent's app tools (core's `APP_TOOL_DECLARATIONS`: `start_app`, `stop_app`, `list_apps`, `reload_view`,
 * `set_auto_reload`), built from the same declarations as hq's copies and forwarded to hq like the code tools. Offered
 * to every code-work run and to a run whose verified capability names a live preview (`mcpServer.ts`); hq answers a
 * call only while the run's branch has a live preview on the run's site, and refuses it otherwise.
 */
import { z, type ZodRawShape, type ZodTypeAny } from 'zod'
import { APP_TOOL_DECLARATIONS, type AppToolArg, type ToolPermission } from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'

function argSchema(arg: AppToolArg): ZodTypeAny {
  if (arg.type === 'boolean') return z.boolean().describe(arg.description)
  const base = arg.type === 'string' ? (arg.maxLength ? z.string().max(arg.maxLength) : z.string()) : z.record(z.string(), z.string())
  const described = base.describe(arg.description)
  return arg.optional ? described.optional() : described
}

export const FORWARDED_APP_TOOLS: ForwardedTool[] = APP_TOOL_DECLARATIONS.map(d => {
  const schema: ZodRawShape = Object.fromEntries(Object.entries(d.args).map(([k, a]) => [k, argSchema(a)]))
  schema.runId = z.string().optional().describe('Filled in by the site with the run this is called from; leave it out')
  return { name: d.name, description: d.description, schema, runIdFromCaller: true as const }
})

export const APP_TOOL_NAME_SET: ReadonlySet<string> = new Set(FORWARDED_APP_TOOLS.map(t => t.name))

/** Opening a live preview is the permission for its app tools: none of them ever asks (live preview spec section 4). */
export function withAppTools(permissions: ToolPermission[]): ToolPermission[] {
  return [
    ...permissions.filter(p => !APP_TOOL_NAME_SET.has(p.name)),
    ...[...APP_TOOL_NAME_SET].map(name => ({ name, state: 'always' as const })),
  ]
}
