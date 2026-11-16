/**
 * The task, board, sprint, starting and routine tools' argument schemas, built from core's
 * `SERVED_TASK_TOOL_DECLARATIONS` as the site's are (`site/src/server/mcp/forwardedTaskSchemas.ts`), so the words an agent reads and the shape hq validates cannot
 * drift. Spread into CONTROL_PLANE_TOOLS, so every transport validates against them: a run's data path, a person's
 * connection and a conversation's turn. `open_board` is a conversation's own tool (conversations/work/tasks).
 */
import { z, type ZodTypeAny } from 'zod'
import { CONVERSATION_ONLY_TASK_TOOLS, SERVED_TASK_TOOL_DECLARATIONS, type TaskToolArg, type TaskToolDeclaration } from '@agenthix/core'
import type { ControlPlaneTool } from './toolSchemas'

function baseOf(arg: TaskToolArg): ZodTypeAny {
  switch (arg.type) {
    case 'string':
      if (arg.values) return z.enum(arg.values as [string, ...string[]])
      return arg.maxLength ? z.string().max(arg.maxLength) : z.string()
    case 'number': return z.number().int().positive()
    case 'boolean': return z.boolean()
    case 'stringList': return arg.maxItems ? z.array(z.string()).max(arg.maxItems) : z.array(z.string())
    case 'stringMap': return z.record(z.string(), z.string())
  }
}

export function taskToolArgSchema(arg: TaskToolArg): ZodTypeAny {
  let schema = baseOf(arg)
  if (arg.nullable) schema = schema.nullable()
  if (arg.optional) schema = schema.optional()
  return schema.describe(arg.description)
}

export function taskToolSchema(d: TaskToolDeclaration): ControlPlaneTool {
  return {
    name: d.name,
    area: d.area,
    description: d.description,
    schema: Object.fromEntries(Object.entries(d.args).map(([k, a]) => [k, taskToolArgSchema(a)])),
  }
}

/** The served task tools every transport reaches through the registry. */
export const TASK_TOOLS: ControlPlaneTool[] = SERVED_TASK_TOOL_DECLARATIONS
  .filter(d => !CONVERSATION_ONLY_TASK_TOOLS.has(d.name))
  .map(taskToolSchema)

export const TASK_TOOL_NAME_SET: ReadonlySet<string> = new Set(TASK_TOOLS.map(t => t.name))
