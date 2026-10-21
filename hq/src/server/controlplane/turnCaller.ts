/**
 * What a conversation's turn may call at the one tool entry (adr-0082, conversation layer spec, Tool execution
 * contract). A turn reaches hq's own operations in process, as a run reaches them through its site, and is held
 * to the same rules: the person it acts for, at each call (authorize.ts, adr-0101). On top of that, what a run's
 * site enforces for it is enforced here for a turn, since no site stands between the two: the agent's tool
 * permissions in the place, strictest winning, minted into the turn's capability.
 *
 * A turn calls only the quick tools: none that starts work (a run, a schedule, a routine), which a conversation
 * commissions as an operation of its own, and none of the data path's, which act for a run in its container.
 *
 * A tool at Ask is never called by a turn directly: the lead offers it with a reason and the call waits for a
 * person's answer (conversation layer spec, Approval). Once approved it runs under `allowOnce`, the one call the
 * answer let through.
 */
import { type CapabilityEffectivePermissions, type ToolPermissionState } from '@agenthix/core'
import { TOOL_GROUPS } from './connectionGroups'
import { ControlPlaneError, type TurnCaller } from './types'

/** Tools no turn calls, though they have a connection group: deprecated, or starting work. */
const NOT_FOR_TURNS: ReadonlySet<string> = new Set(['tick_subtask'])

/** Whether a turn may ever call a tool, whatever its permissions. */
export function isTurnTool(tool: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(TOOL_GROUPS, tool)) return false
  return TOOL_GROUPS[tool] !== 'start_work' && !NOT_FOR_TURNS.has(tool)
}

/** Whether a tool only reads: what a turn that answers no one may call. */
export function isReadTool(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_GROUPS, tool) && TOOL_GROUPS[tool] === 'read'
}

/**
 * A tool's state for the turn, read as a run's site reads it (toolGate.ts): Never wins even when bypassed; a
 * bypassed turn has every other tool at Always; otherwise a tool the list leaves out is Ask.
 */
export function turnToolState(permissions: CapabilityEffectivePermissions, tool: string): ToolPermissionState {
  if (permissions.neverTools.includes(tool)) return 'never'
  if (permissions.bypassed) return 'always'
  return permissions.allowedTools.find(p => p.name === tool)?.state ?? 'ask'
}

/** Why a turn may not call this tool now, or null when it may. */
export function turnToolRefusal(turn: TurnCaller['turn'], tool: string, now = Date.now()): string | null {
  if (turn.expiresAt <= now) return "This turn's authority has expired"
  if (!isTurnTool(tool)) return `${tool} is not available in a conversation`
  if (!turn.actingUserId && !isReadTool(tool)) return `${tool} changes something, and this turn acts for no one: it may only read`
  const state = turnToolState(turn.permissions, tool)
  if (state === 'never') return `${tool} is not available for this agent`
  // Only a call a person approved runs at Ask, under allowOnce; the lead asks for it instead (toolCalls/ask.ts).
  if (state === 'ask') return `${tool} needs a person's approval first: ask for it with a reason`
  return null
}

/** The turn with one tool at Always: the call a person approved, run as it was asked. */
export function allowOnce<T extends { permissions: CapabilityEffectivePermissions }>(turn: T, tool: string): T {
  const allowedTools = [...turn.permissions.allowedTools.filter(p => p.name !== tool), { name: tool, state: 'always' as const }]
  return { ...turn, permissions: { ...turn.permissions, allowedTools } }
}

/** Whether the turn may call this tool only by asking a person first: at Ask, and allowed once that person says yes. */
export function turnToolAsks(turn: TurnCaller['turn'], tool: string, now = Date.now()): boolean {
  return turnToolState(turn.permissions, tool) === 'ask' && turnToolRefusal(allowOnce(turn, tool), tool, now) === null
}

/** The turn's own gate at the tool entry, before the operation checks its person. */
export function requireTurnTool(ctx: TurnCaller, tool: string): void {
  const refusal = turnToolRefusal(ctx.turn, tool)
  if (refusal) throw new ControlPlaneError('forbidden', refusal)
}
