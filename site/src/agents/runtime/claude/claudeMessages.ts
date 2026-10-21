/**
 * What the Claude Agent SDK's messages mean to a run: the events the engine
 * streams and records, and the facts a turn keeps — which model ran it, and
 * how it ended.
 *
 * Read structurally rather than through the SDK's union type: the fields read
 * here are the ones the runtime has always read, and a message of a kind this
 * does not know yields nothing.
 */
import type { RunEvent } from '../types'
import { withCredentialHint, type ProviderRetry } from '../providerRetry'

type Message = { type?: unknown; subtype?: unknown; [key: string]: unknown }
type Block = { type?: unknown; [key: string]: unknown }

function blocksOf(content: unknown): Block[] {
  return Array.isArray(content) ? content.filter((b): b is Block => !!b && typeof b === 'object') : []
}

/** What a turn's text so far tells the next text block: one that starts after another begins a new paragraph. */
export type TurnText = {
  seen: boolean
  breakPending: boolean
  /** Ids of the model responses already counted: the CLI sends one assistant message per content block, all sharing their response's id. */
  modelResponses?: Set<string>
}

/** The streaming, tool-call and tool-result events one message carries. */
export function runEventsOf(message: Message, text: TurnText = { seen: false, breakPending: false }): RunEvent[] {
  if (message.type === 'stream_event') {
    const event = message.event as { type?: string; content_block?: { type?: string }; delta?: { type?: string; text?: string; thinking?: string } } | undefined
    if (event?.type === 'content_block_start' && event.content_block?.type === 'text') text.breakPending = text.seen
    if (event?.type !== 'content_block_delta') return []
    if (event.delta?.type === 'text_delta' && event.delta.text) {
      const lead = text.breakPending ? '\n\n' : ''
      text.breakPending = false
      text.seen = true
      return [{ type: 'text_delta', textDelta: lead + event.delta.text }]
    }
    if (event.delta?.type === 'thinking_delta' && event.delta.thinking) return [{ type: 'thinking', thinking: event.delta.thinking }]
    return []
  }
  if (message.type === 'assistant') {
    const inner = message.message as { id?: unknown; content?: unknown } | undefined
    const calls: RunEvent[] = blocksOf(inner?.content)
      .filter(b => b.type === 'tool_use')
      .map(b => ({ type: 'tool_call', toolUseId: String(b.id), toolName: String(b.name), toolInput: b.input }))
    const id = typeof inner?.id === 'string' ? inner.id : undefined
    if (id && text.modelResponses?.has(id)) return calls
    if (id) text.modelResponses?.add(id)
    return [{ type: 'model_round_trip' }, ...calls]
  }
  if (message.type === 'user') {
    const content = (message.message as { content?: unknown } | undefined)?.content
    return blocksOf(content)
      .filter(b => b.type === 'tool_result')
      .map(b => ({
        type: 'tool_result',
        toolUseId: String(b.tool_use_id),
        output: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
      }))
  }
  return []
}

/**
 * The model the CLI says it is running, from its `system/init` message (one per
 * turn), or from an assistant message. The CLI renames retired model ids, and
 * differently between versions, so this — not the id requested — is the one a
 * run records (spec §1).
 */
export function reportedModelOf(message: Message): string | undefined {
  if (message.type === 'system' && message.subtype === 'init' && typeof message.model === 'string') return message.model
  if (message.type === 'assistant') {
    const model = (message.message as { model?: unknown } | undefined)?.model
    if (typeof model === 'string' && model) return model
  }
  return undefined
}

/**
 * What the CLI answered itself, in a turn that reached no model (`num_turns`
 * 0) — a local command's answer, such as `Unknown command: /x` — which is
 * only in its `result`; undefined for any other turn.
 */
export function localAnswerOf(message: Message): string | undefined {
  if (message.type !== 'result' || message.subtype !== 'success' || message.num_turns !== 0 || message.is_error === true) return undefined
  return typeof message.result === 'string' && message.result.trim() ? message.result : undefined
}

/**
 * The CLI's notice that it will retry a failed model request itself
 * (`system/api_retry`, with the attempt, the delay, and the HTTP status or
 * null when there was no response), as a retry the turn shows (providerRetry.ts).
 */
export function retryOf(message: Message): ProviderRetry | undefined {
  if (message.type !== 'system' || message.subtype !== 'api_retry' || typeof message.attempt !== 'number') return undefined
  const status = typeof message.error_status === 'number' ? message.error_status : null
  const kind = typeof message.error === 'string' ? message.error : ''
  return {
    attempt: message.attempt,
    reason: [status ?? 'no response', kind].filter(Boolean).join(' '),
    ...(typeof message.retry_delay_ms === 'number' ? { waitMs: message.retry_delay_ms } : {}),
    rateLimited: status === 429 || kind === 'rate_limit',
  }
}

/** The turn's terminal status event, from its `result` message. */
export function resultEventOf(message: Message, model: string, sdkSessionId: string): RunEvent {
  // A model request that failed for good ends the turn as a "success" with
  // `is_error` set and the CLI's own account of the error as its result.
  if (message.subtype === 'success' && message.is_error === true) {
    const status = typeof message.api_error_status === 'number' ? message.api_error_status : null
    const text = typeof message.result === 'string' && message.result.trim() ? message.result.trim() : `The model provider answered ${status ?? 'with an error'}`
    return { type: 'status', status: 'failed', error: withCredentialHint(text, status) }
  }
  if (message.subtype === 'success') {
    const raw = message.usage as Record<string, number | undefined> | null | undefined
    const usage = raw ? (() => {
      const inputTokens = raw.input_tokens ?? 0
      const cacheReadTokens = raw.cache_read_input_tokens ?? 0
      const cacheWriteTokens = raw.cache_creation_input_tokens ?? 0
      const outputTokens = raw.output_tokens ?? 0
      const totalTokens = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens
      return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens }
    })() : undefined
    return { type: 'status', status: 'completed', model, sdkSessionId, usage }
  }
  const errors = Array.isArray(message.errors) ? message.errors.filter(e => typeof e === 'string').join('; ') : ''
  const error = String(message.error ?? '') || errors || String(message.subtype ?? '') || 'Unknown error'
  return { type: 'status', status: 'failed', error }
}
