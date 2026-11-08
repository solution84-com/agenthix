/**
 * The task, board and sprint tools an agent is given (spec *What changes*, Agents' tools), built from core's
 * `SERVED_TASK_TOOL_DECLARATIONS`, which hq's copy is built from too (`hq/src/server/controlplane/taskToolSchemas.ts`),
 * so the two can't drift. Spread into FORWARDED_TOOLS. `open_board` is a conversation's own tool in hq: a run has no
 * one beside it to show a board to, so it is not forwarded.
 */
import { z, type ZodTypeAny } from 'zod'
import { CONVERSATION_ONLY_TASK_TOOLS, SERVED_TASK_TOOL_DECLARATIONS, type TaskToolArg } from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'

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

export function forwardedTaskArg(arg: TaskToolArg): ZodTypeAny {
  let schema = baseOf(arg)
  if (arg.nullable) schema = schema.nullable()
  if (arg.optional) schema = schema.optional()
  return schema.describe(arg.description)
}

export const FORWARDED_TASK_TOOLS: ForwardedTool[] = SERVED_TASK_TOOL_DECLARATIONS
  .filter(d => !CONVERSATION_ONLY_TASK_TOOLS.has(d.name))
  .map(d => ({
    name: d.name,
    description: d.description,
    schema: Object.fromEntries(Object.entries(d.args).map(([k, a]) => [k, forwardedTaskArg(a)])),
  }))

export const TASK_TOOL_NAME_SET: ReadonlySet<string> = new Set(FORWARDED_TASK_TOOLS.map(t => t.name))
