/**
 * The streaming half of a run, split out of AgentEngine.processRun (R-071): turns
 * the runtime's events into the live `run.stream` frames hq relays to the browser
 * and accumulates what the persistence step and the terminal frame need afterwards.
 * Nothing here touches the database or decides the run's outcome — a failed or
 * cancelled `status` event is only recorded (`runFailed`/`runError`,
 * `runCancelled`) for the caller.
 */
import type { ContextUse, JsonValue } from '@agenthix/core'
import { siteStream } from './SiteStreamEmitter'
import type { RunEvent } from './types'

export type RunUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens: number
}

export interface StreamedRun {
  fullReply: string
  accumulatedThought: string
  usedModel: string | undefined
  runUsage: RunUsage | undefined
  runFailed: boolean
  runError: string | undefined
  /** The runtime reported the turn cancelled (its harness was stopped). */
  runCancelled: boolean
  /** Each call by the harness's id, in the order made, with when it was made. */
  toolCallMap: Map<string, { toolName: string; toolInput: unknown; output?: string; at: Date }>
  accThinkingMs: number
  /** The thinking in the stretches it came in — one per run of thinking between other events — each with when it began. */
  thoughts: Array<{ at: Date; text: string }>
  /** Where the runtime summarised its memory during the turn. */
  compactions: Array<{ at: Date; trigger: 'auto' | 'manual'; summary: string | null; tokensBefore: number | null }>
  /** The runtime's memory of the conversation as the turn ended, when it said. */
  contextUse: ContextUse | undefined
}

export function newStreamedRun(): StreamedRun {
  return {
    fullReply: '',
    accumulatedThought: '',
    usedModel: undefined,
    runUsage: undefined,
    runFailed: false,
    runError: undefined,
    runCancelled: false,
    toolCallMap: new Map(),
    accThinkingMs: 0,
    thoughts: [],
    compactions: [],
    contextUse: undefined,
  }
}

export interface RunEventScope {
  runId: string
  sessionId: string
  taskId: string | null
  signal: AbortSignal
  /** Called for each round trip with the model that comes back (the run's turn limit). */
  onModelRoundTrip?: () => void
}

/**
 * `streamed` is filled as events arrive, so a caller holding it still has
 * what the turn did when the runtime throws part way (runFailure.ts).
 */
export async function consumeRunEvents(
  events: AsyncIterable<RunEvent>,
  scope: RunEventScope,
  streamed: StreamedRun = newStreamedRun(),
): Promise<StreamedRun> {
  const { runId, sessionId, taskId, signal, onModelRoundTrip } = scope
  let thinkingPhaseStart: number | null = Date.now()
  let thinking = false

  const flushThinkingPhase = () => {
    if (thinkingPhaseStart !== null) {
      streamed.accThinkingMs += Date.now() - thinkingPhaseStart
      thinkingPhaseStart = null
    }
  }

  for await (const event of events) {
    if (signal.aborted) break
    if (event.type !== 'thinking' && event.type !== 'model_round_trip' && event.type !== 'notice') thinking = false

    switch (event.type) {
      case 'model_round_trip':
        onModelRoundTrip?.()
        break

      case 'text_delta':
        flushThinkingPhase()
        streamed.fullReply += event.textDelta
        siteStream.stream({
          sessionId, runId, taskId, targetRoom: 'session',
          name: 'agentStreamDelta', data: { runId, textDelta: event.textDelta },
        })
        break

      case 'tool_call':
        flushThinkingPhase()
        streamed.toolCallMap.set(event.toolUseId, { toolName: event.toolName, toolInput: event.toolInput, at: new Date() })
        siteStream.stream({
          sessionId, runId, taskId, targetRoom: 'session',
          name: 'agentToolCall',
          // The harness parsed the call's input from the model's JSON.
          data: { runId, toolUseId: event.toolUseId, toolName: event.toolName, toolInput: event.toolInput as JsonValue },
        })
        break

      case 'tool_result': {
        const call = streamed.toolCallMap.get(event.toolUseId)
        if (call) call.output = event.output
        siteStream.stream({
          sessionId, runId, taskId, targetRoom: 'session',
          name: 'agentToolResult',
          data: { runId, toolUseId: event.toolUseId, output: event.output },
        })
        thinkingPhaseStart = Date.now()
        break
      }

      case 'thinking':
        streamed.accumulatedThought += event.thinking
        if (!thinking) streamed.thoughts.push({ at: new Date(), text: '' })
        streamed.thoughts[streamed.thoughts.length - 1].text += event.thinking
        thinking = true
        siteStream.stream({
          sessionId, runId, taskId, targetRoom: 'session',
          name: 'agentThinking', data: { runId, thinking: event.thinking },
        })
        break

      case 'notice':
        siteStream.stream({
          sessionId, runId, taskId, targetRoom: 'session',
          name: 'agentRunNotice', data: { runId, notice: event.notice },
        })
        break

      case 'compacted':
        streamed.compactions.push({ at: new Date(), trigger: event.trigger, summary: event.summary, tokensBefore: event.tokensBefore })
        break

      case 'context_use':
        streamed.contextUse = event.use
        break

      case 'status':
        flushThinkingPhase()
        if (event.status === 'failed') {
          streamed.runFailed = true
          streamed.runError = event.error
        }
        if (event.status === 'cancelled') streamed.runCancelled = true
        if (event.model) streamed.usedModel = event.model
        if (event.usage) streamed.runUsage = event.usage
        break
    }
  }

  return streamed
}
