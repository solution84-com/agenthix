/**
 * A live preview's app tools (`start_app`, `stop_app`, `list_apps`, `reload_view`, `set_auto_reload`), built from
 * core's declarations as the site's copies are to be. Data-path only: a run's site forwards them with the calling
 * run's id, and only a run on a branch (or `main`) with a live preview is answered.
 */
import { z, type ZodTypeAny } from 'zod'
import { APP_TOOL_DECLARATIONS, type AppToolArg, type AppToolDeclaration } from '@agenthix/core'
import type { ControlPlaneTool } from './toolSchemas'

const RUN_ID = z.string().optional().describe('Filled in by the site with the run this is called from; leave it out')

function argSchema(arg: AppToolArg): ZodTypeAny {
  if (arg.type === 'boolean') return z.boolean().describe(arg.description)
  if (arg.type === 'stringMap') return z.record(z.string(), z.string()).describe(arg.description)
  const text = arg.maxLength === undefined ? z.string() : z.string().max(arg.maxLength)
  return (arg.optional ? text.optional() : text).describe(arg.description)
}

function toolSchema(d: AppToolDeclaration): ControlPlaneTool {
  const schema: Record<string, ZodTypeAny> = { runId: RUN_ID }
  for (const [name, arg] of Object.entries(d.args)) schema[name] = argSchema(arg)
  return { name: d.name, description: d.description, schema }
}

export const APP_TOOL_SCHEMAS: ControlPlaneTool[] = APP_TOOL_DECLARATIONS.map(toolSchema)
