/**
 * The workflow tools' argument schemas for hq's data path, built from core's `WORKFLOW_TOOL_DECLARATIONS` as the
 * site's are (`site/src/server/mcp/forwardedWorkflowSchemas.ts`), so the two can't drift. Data-path only: a person's
 * connection never runs a workflow as an agent.
 */
import { z, type ZodRawShape, type ZodTypeAny } from 'zod'
import { WORKFLOW_TOOL_DECLARATIONS, type ToolArea, type WorkflowToolArg } from '@agenthix/core'

type ToolSchema = { name: string; area: ToolArea; description?: string; schema: ZodRawShape }

function argSchema(arg: WorkflowToolArg): ZodTypeAny {
  const base = arg.type === 'string'
    ? (arg.maxLength ? z.string().max(arg.maxLength) : z.string())
    : z.record(z.string(), z.string())
  const described = base.describe(arg.description)
  return arg.optional ? described.optional() : described
}

export const WORKFLOW_TOOL_SCHEMAS: ToolSchema[] = WORKFLOW_TOOL_DECLARATIONS.map((d) => ({
  name: d.name,
  area: d.area,
  description: d.description,
  schema: {
    ...Object.fromEntries(Object.entries(d.args).map(([k, a]) => [k, argSchema(a)])),
    runId: z.string().optional().describe('Filled in by the site with the run this is called from; leave it out'),
  },
}))
