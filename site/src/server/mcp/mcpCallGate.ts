/**
 * The tool gate at the platform server (`/mcp`): a tool call is served only on
 * the same decision a harness's own call gets (agents/runtime/toolGate.ts) —
 * `never` and `ask` against the run's approved manifest, a stopped or pausing
 * run, and its `ToolCallLog` row. A call the harness's gate already allowed
 * carries a pass (gatePasses.ts) and is served without a second decision; any
 * other call, such as one sent straight to `/mcp` with the run's token, is
 * decided here.
 */
import type { RunContext } from '../../agents/runtime/types'
import { decideToolCall, recordToolCall, RUN_STOPPED_TEXT } from '../../agents/runtime/toolGate'
import { takePass } from '../../agents/runtime/gatePasses'
import { gateRunStopped } from '../../agents/runtime/toolGateRuns'

/** What a call is told when no turn of its conversation is running. */
export const NO_TURN_CALL_TEXT = 'No turn of this conversation is running, so the call was not run.'

/**
 * Null when the call may be served; otherwise what the caller is told.
 * `turn`: the running turn the token acts for, or null; `runId`: the run the token names, if any.
 */
export async function refusePlatformCall(
  turn: RunContext | null,
  runId: string | null,
  toolName: string,
  input: unknown,
): Promise<string | null> {
  if (!turn) {
    if (runId) {
      const blockReason = gateRunStopped(runId) ? 'run-stopped' : 'no-turn'
      await recordToolCall({ runId }, { toolName, input }, { riskLevel: 'FLAGGED', blocked: true, blockReason }).catch(() => {})
      return blockReason === 'run-stopped' ? RUN_STOPPED_TEXT : NO_TURN_CALL_TEXT
    }
    return NO_TURN_CALL_TEXT
  }
  if (takePass(turn.runId, toolName, input)) return null
  const decision = await decideToolCall(turn, { toolName, input }, {})
  if (!decision.allow) return decision.reason
  takePass(turn.runId, toolName, input)
  return null
}
