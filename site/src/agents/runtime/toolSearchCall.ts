/**
 * The tool search's two tools as the gate sees them (lean agent context spec §5–§6, ADR-0193). A call of `use_tool`
 * is the call of the tool it names: Never, Ask and the call's record are decided on that name and its input, so a
 * tool reached through the search is gated, waits and is recorded exactly as its native call would be. `find_tools`
 * needs no permission: it grants nothing, and hq finds only tools the run may use.
 */
import { FIND_TOOLS, USE_TOOL } from '@agenthix/core'
import type { GateCall } from './toolGate'
import type { ToolPermission } from './types'

export interface InnerCall {
  name: string
  input: Record<string, unknown>
  /** Why the agent calls it: what a person reads when the tool asks first. */
  reason?: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The input a model gave, which a model may also send as JSON text. */
function inputOf(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return {}
  if (isRecord(raw)) return raw
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** The call a `use_tool` input names, or null when it names none, or names one of the search's own tools. */
export function innerCallOf(useToolInput: unknown): InnerCall | null {
  if (!isRecord(useToolInput)) return null
  const name = typeof useToolInput.name === 'string' ? useToolInput.name.trim() : ''
  if (!name || name === USE_TOOL || name === FIND_TOOLS) return null
  const input = inputOf(useToolInput.input)
  if (!input) return null
  const reason = typeof useToolInput.reason === 'string' && useToolInput.reason.trim() ? useToolInput.reason.trim() : undefined
  return { name, input, ...(reason ? { reason } : {}) }
}

/**
 * The call the gate decides. A `use_tool` call that names no tool it can run is left as itself and permission-free:
 * the platform server refuses it, and it runs nothing.
 */
export function gateCallOf(call: GateCall): GateCall {
  if (call.toolName === FIND_TOOLS) return { ...call, permissionFree: true }
  if (call.toolName !== USE_TOOL) return call
  const inner = innerCallOf(call.input)
  if (!inner) return { ...call, permissionFree: true }
  return {
    toolName: inner.name,
    input: inner.input,
    ...(call.toolUseId ? { toolUseId: call.toolUseId } : {}),
    target: inner.reason ?? null,
  }
}

/**
 * A run's permissions with the search's two tools at Always, as the code tools are pinned for code work: hq mints a
 * run's permissions from its own tool list, and each tool the search reaches is decided on its own name.
 */
export function withToolSearchTools(permissions: ToolPermission[]): ToolPermission[] {
  const names: ReadonlySet<string> = new Set([FIND_TOOLS, USE_TOOL])
  return [...permissions.filter(p => !names.has(p.name)), ...[...names].map(name => ({ name, state: 'always' as const }))]
}

/**
 * A harness's tool call as the run records and streams it: a `use_tool` call as the tool it names, in the harness's
 * own naming (Claude's `mcp__platform__use_tool` becomes `mcp__platform__<name>`), so nothing reads differently.
 */
export function recordedToolCall(toolName: string, toolInput: unknown): { toolName: string; toolInput: unknown } {
  const prefix = toolName === USE_TOOL ? '' : toolName.endsWith(`__${USE_TOOL}`) ? toolName.slice(0, -USE_TOOL.length) : null
  const inner = prefix === null ? null : innerCallOf(toolInput)
  return inner ? { toolName: `${prefix}${inner.name}`, toolInput: inner.input } : { toolName, toolInput }
}
