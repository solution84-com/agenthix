/**
 * hq's own foreground tools as a conversation's lead sees them (conversation layer spec, Tool execution
 * contract): the control-plane operations a turn may call (turnCaller.ts), each with the Zod schema the other
 * transports validate against (toolSchemas.ts), and only those its capability lets it use without asking.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { RESULT_CAP_CHARS, RESULT_TOO_LARGE } from '../../shared/conversations/protocol'
import { CONTROL_PLANE_TOOLS, WORKFORCE_TOOLS, type ControlPlaneTool } from '../../server/controlplane/toolSchemas'
import { isTurnTool, turnToolRefusal } from '../../server/controlplane/turnCaller'
import type { LeadToolDefinition, TurnCapability } from '../contract'

const TURN_TOOLS: ReadonlyMap<string, ControlPlaneTool> = new Map(
  [...CONTROL_PLANE_TOOLS, ...WORKFORCE_TOOLS].filter(t => isTurnTool(t.name)).map(t => [t.name, t]),
)

/** The tool by name, when a turn may ever call it. */
export function turnTool(name: string): ControlPlaneTool | null {
  return TURN_TOOLS.get(name) ?? null
}

/** The tools this capability may call now, as the lead is given them. */
export function turnToolDefinitions(capability: TurnCapability, now = Date.now()): LeadToolDefinition[] {
  return [...TURN_TOOLS.values()]
    .filter(t => turnToolRefusal(capability, t.name, now) === null)
    .map(t => ({ name: t.name, description: t.description ?? describeByName(t.name), input: z.object(t.schema) }))
}

/** A tool with no description of its own is described by its name: `list_tasks` → "List tasks." */
function describeByName(name: string): string {
  const words = name.replace(/_/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

/** The line the activity sheet shows for a call of this tool. */
export function toolCallTitle(name: string): string {
  return describeByName(name).slice(0, -1)
}

/** One call's identity within its conversation: the tool and its arguments, keys in order, so the same ask is the same key. */
export function idempotencyKey(tool: string, args: unknown): string {
  return createHash('sha256').update(`${tool}\n${canonicalJson(args)}`).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * What the lead receives of a result: the value itself when it fits the cap, and otherwise as much of its text
 * as fits with the line telling the lead to brief a worker for the rest.
 */
export function capResult(result: unknown): unknown {
  const value = result === undefined ? null : result
  const text = JSON.stringify(value)
  if (text.length <= RESULT_CAP_CHARS) return value
  const tail = `\n[${RESULT_TOO_LARGE}]`
  return `${text.slice(0, RESULT_CAP_CHARS - tail.length)}${tail}`
}
