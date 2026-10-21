/**
 * POST /api/v1/harness/gate — Agenthix's OpenCode plugin asks here before
 * every tool call (spec, "Per-call authorization gate" item 3; core's
 * `HARNESS_GATE_PATH`). Authenticated here, like the MCP endpoint: the
 * bearer is the conversation's platform token (conversationTokens.ts), which
 * resolves to the turn running now and to nothing between turns, so a
 * decision only ever belongs to the current turn (adr-0082).
 *
 * It fails closed. No turn running, a turn stopped, a malformed request or an
 * error is a refusal. Stopping a turn answers its pending decisions with a
 * refusal before the harness is told to stop, and every later request for
 * that run is refused (toolGateRuns.ts), so no call is allowed after an abort.
 */
import type { ApiHandler } from '../http/apiHandler'
import { HARNESS_GATE_UNAVAILABLE, parseHarnessGateRequest } from '@agenthix/core'
import type { HarnessGateRequest, HarnessGateResponse } from '@agenthix/core'
import { resolveConversationToken } from '../runtime/conversationTokens'
import { gateRunContext, gateRunStopped } from '../../agents/runtime/toolGateRuns'
import { RUN_STOPPED_TEXT, recordToolCall } from '../../agents/runtime/toolGate'
import { decideOpenCodeCall } from '../../agents/runtime/opencode/openCodeGate'
import type { OpenCodeGateOptions } from '../../agents/runtime/opencode/openCodeGate'

/** What the model is told when no turn of its conversation is running. */
export const NO_TURN_TEXT = 'No turn of this conversation is running, so the call was not run.'

const refuse = (message: string): HarnessGateResponse => ({ decision: 'refuse', message })

/** The decision for one gate request made with `token`. Never rejects. */
export async function answerHarnessGate(
  token: string,
  request: HarnessGateRequest,
  options: OpenCodeGateOptions = {},
): Promise<HarnessGateResponse> {
  try {
    const turn = resolveConversationToken(token)
    if (!turn) return refuse(NO_TURN_TEXT)
    if (gateRunStopped(turn.runId)) {
      await recordToolCall({ runId: turn.runId }, { toolName: request.tool, input: request.args, toolUseId: request.callId },
        { riskLevel: 'FLAGGED', blocked: true, blockReason: 'run-stopped' }).catch(() => {})
      return refuse(RUN_STOPPED_TEXT)
    }
    const context = gateRunContext(turn.runId)
    if (!context || context.sessionId !== turn.sessionId) return refuse(NO_TURN_TEXT)
    return await decideOpenCodeCall(context, request, options)
  } catch {
    return refuse(HARNESS_GATE_UNAVAILABLE)
  }
}

export const harnessGateHandler: ApiHandler = async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(refuse(HARNESS_GATE_UNAVAILABLE))
    return
  }
  const request = parseHarnessGateRequest(req.body)
  if (!request) {
    res.status(400).json(refuse(HARNESS_GATE_UNAVAILABLE))
    return
  }
  res.json(await answerHarnessGate(authHeader.substring(7), request))
}
