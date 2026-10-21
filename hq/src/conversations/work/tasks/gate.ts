/**
 * Whether a turn may call one of its task tools now (conversation layer spec, Tool execution contract): the same
 * rules as a turn's other tools (turnCaller.ts), read for run_task and create_task, which turnCaller keeps for
 * runs and connections. Only a turn that answers a person acts; a report turn is offered no tools at all.
 */
import { HttpError } from 'wasp/server'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { turnToolState } from '../../../server/controlplane/turnCaller'
import type { ToolCallOutcome, TurnCapability } from '../../contract'

export function taskToolRefusal(capability: TurnCapability, tool: string, now = Date.now()): string | null {
  if (capability.trigger === 'REPORT') return `${tool} is not available while presenting results`
  if (capability.expiresAt <= now) return "This turn's authority has expired"
  if (!capability.actingUserId) return `${tool} changes something, and this turn acts for no one: it may only read`
  const state = turnToolState(capability.permissions, tool)
  if (state === 'never') return `${tool} is not available for this agent`
  // At Ask the tool adapter offers it with a reason and the call waits for a person (toolCalls/ask.ts); only the
  // approved call, run under allowOnce, gets past here.
  if (state === 'ask') return `${tool} needs a person's approval first: ask for it with a reason`
  return null
}

/** A refusal the lead can say: a rule's own words; anything else is reported as the tool having failed. */
export function refusedBy(tool: string, err: unknown, logError: (message: string, err: unknown) => void): ToolCallOutcome {
  if (err instanceof ControlPlaneError) return { status: 'refused', reason: err.message }
  if (err instanceof HttpError && err.statusCode < 500) return { status: 'refused', reason: err.message }
  logError(`${tool} failed in a conversation`, err)
  return { status: 'refused', reason: `${tool} failed` }
}
