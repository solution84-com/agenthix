/**
 * The agent's four workflow tools (workflows spec part 1, *The agent's tools*), built from core's
 * `WORKFLOW_TOOL_DECLARATIONS`, which hq's copy is built from too, so the two can't drift. Spread into
 * FORWARDED_TOOLS. Each acts for the calling run, whose id the site fills in; no tool approves or switches.
 */
import { z, type ZodRawShape, type ZodTypeAny } from 'zod'
import { WORKFLOW_TOOL_DECLARATIONS, type WorkflowToolArg } from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'

function argSchema(arg: WorkflowToolArg): ZodTypeAny {
  const base = arg.type === 'string'
    ? (arg.maxLength ? z.string().max(arg.maxLength) : z.string())
    : z.record(z.string(), z.string())
  const described = base.describe(arg.description)
  return arg.optional ? described.optional() : described
}

export const FORWARDED_WORKFLOW_TOOLS: ForwardedTool[] = WORKFLOW_TOOL_DECLARATIONS.map((d) => {
  const schema: ZodRawShape = Object.fromEntries(Object.entries(d.args).map(([k, a]) => [k, argSchema(a)]))
  schema.runId = z.string().optional().describe('Filled in by the site with the run this is called from; leave it out')
  return { name: d.name, description: d.description, schema, runIdFromCaller: true as const }
})

export const WORKFLOW_TOOL_NAME_SET: ReadonlySet<string> = new Set(WORKFLOW_TOOL_DECLARATIONS.map((d) => d.name))
