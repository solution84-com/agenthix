import { SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import { callHqData } from '../../server/hq/dataClient'
import { Logger } from '../../server/utils/logger'
import type { RunContext, RunEvent } from '../../agents/runtime/types'

const logger = new Logger('DemoRunResult')

/** hq's limit on a stated result (the set_result tool's schema). */
const RESULT_MAX = 4000

/** What a scripted run says last: the text after its final non-text event, trimmed; null when it said nothing. */
export function finalText(events: readonly RunEvent[]): string | null {
  let text = ''
  for (const e of events) {
    if (e.type === 'text_delta') text += e.textDelta
    else if (e.type === 'tool_call' || e.type === 'tool_result') text = ''
  }
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, RESULT_MAX) : null
}

/**
 * States the run's result to hq the way a harness's agent does, through the set_result tool and the run's own
 * capability. A run that fails to state it ends as one that stated none, which is what it was before.
 */
export async function stateResultToHq(context: RunContext, result: string): Promise<void> {
  const jwt = context.capability?.jwt
  if (!jwt) return
  try {
    await callHqData(SYSTEM_MCP_TOOLS.RUN.SET_RESULT, { result, runId: context.runId }, jwt)
  } catch (err) {
    logger.warn(`could not state the result of run ${context.runId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
