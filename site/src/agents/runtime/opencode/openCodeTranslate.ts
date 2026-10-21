/**
 * One turn's OpenCode events, for one session, turned into the runtime's
 * `RunEvent`s (spec §8), and the turn's outcome worked out from them.
 *
 * - Text and reasoning stream as `message.part.delta`; a part's full update
 *   also carries its whole text, so whatever a delta missed is sent from the
 *   full text, and nothing is sent twice.
 * - A tool call is announced `pending` with no arguments; it becomes a
 *   `tool_call` once `running` carries them, and a `tool_result` when it
 *   completes or fails. A refusal from the gate is such a failure: the
 *   steering text is the result.
 * - Parts of the person's own message are never the reply.
 * - Each step (`step-finish`) is one round trip with the model and is announced
 *   as `model_round_trip`, once, for the turn limit. Tokens are summed over the steps; the model is the
 *   one OpenCode reports running, with its provider (`openrouter/…:free` kept).
 * - The turn is over at `session.idle`: failed if OpenCode reported an error,
 *   cancelled if it reported the abort.
 * - OpenCode retrying a failed model request (`session.status` `retry`) is a
 *   notice; past the bound in providerRetry.ts the turn gives up (`gaveUp`),
 *   the caller aborts OpenCode's session, and the turn fails with the
 *   provider's reason rather than as a cancel.
 * - OpenCode summarising the session's memory: the text of the message
 *   marked `summary` is the summary, never the reply, and `session.compacted`
 *   reports it as `compacted`, automatic or asked for as its `compaction` part
 *   says. A context overflow it recovers from by summarising is a notice.
 * - How full the memory is: the last step's tokens, counted as OpenCode's own
 *   overflow check counts them (`session/overflow.ts`); after a summary, the
 *   summary's own length.
 */
import type { RunEvent } from '../types'
import type { OpenCodeError, OpenCodeEvent, OpenCodePart } from './openCodeEvents'
import { platformToolName } from './openCodeConnection'
import { retryGiveUp, retryNotice, withCredentialHint } from '../providerRetry'

type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

/** What the conversation shows while OpenCode summarises a session whose memory overflowed. */
export const CONTEXT_FULL_NOTICE = "The agent's memory of this conversation is full; it is summarising older messages…"


export function openCodeErrorText(error: OpenCodeError): string {
  const detail = error.data?.message
  if (error.name === 'ProviderAuthError') return withCredentialHint(`The model provider refused the credential${detail ? `: ${detail}` : ''}`, null, true)
  const status = error.data?.statusCode
  if (error.name === 'APIError' && status) return withCredentialHint(`The model provider answered ${status}${detail ? `: ${detail}` : ''}`, status)
  return detail ? `${error.name}: ${detail}` : error.name
}

export class OpenCodeTurnTranslator {
  private roles = new Map<string, 'user' | 'assistant'>()
  private kinds = new Map<string, 'text' | 'reasoning'>()
  private sent = new Map<string, number>()
  private textStarted = false
  private calls = new Map<string, { announced: boolean; finished: boolean }>()
  private usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  private sawUsage = false
  private steps = new Set<string>()
  private model: string | undefined
  private error: string | undefined
  private aborted = false
  private idle = false
  private gaveUpWith: string | undefined
  private summaries = new Set<string>()
  private summaryParts = new Map<string, string>()
  private summaryTokens: number | null = null
  private compactTrigger: 'auto' | 'manual' | null = null
  private lastTokens: number | null = null

  constructor(private readonly connectionName: string, private readonly now: () => number = Date.now) {}

  get done(): boolean {
    return this.idle
  }

  /** Set once OpenCode's retries pass the bound: the caller aborts the session. */
  get gaveUp(): string | undefined {
    return this.gaveUpWith
  }

  /** What the session's memory holds after the turn, in tokens; null when OpenCode reported none. */
  get contextTokens(): number | null {
    return this.lastTokens
  }

  translate(event: OpenCodeEvent): RunEvent[] {
    switch (event.type) {
      case 'message.updated': {
        const info = event.properties.info
        this.roles.set(info.id, info.role)
        if (info.role === 'assistant' && info.summary) this.summaries.add(info.id)
        if (info.role === 'assistant' && info.modelID) this.model = info.providerID ? `${info.providerID}/${info.modelID}` : info.modelID
        if (info.role === 'assistant' && info.error) this.noteError(info.error)
        return []
      }
      case 'message.part.updated':
        return this.part(event.properties.part)
      case 'message.part.delta': {
        const { partID, field, delta } = event.properties
        const kind = this.kinds.get(partID)
        if (field !== 'text' || !kind || !delta) return []
        const first = !this.sent.get(partID)
        this.sent.set(partID, (this.sent.get(partID) ?? 0) + delta.length)
        return [kind === 'text' ? { type: 'text_delta', textDelta: this.textOf(first, delta) } : { type: 'thinking', thinking: delta }]
      }
      case 'session.error':
        // OpenCode reports a context overflow here and then compacts and carries
        // on; one it does not recover from is also on the message (message.updated).
        if (event.properties.error?.name === 'ContextOverflowError') return [{ type: 'notice', notice: CONTEXT_FULL_NOTICE }]
        if (event.properties.error) this.noteError(event.properties.error)
        return []
      case 'session.compacted': {
        const summary = [...this.summaryParts.values()].join('\n\n').trim()
        const event: RunEvent = { type: 'compacted', trigger: this.compactTrigger ?? 'auto', summary: summary || null, tokensBefore: this.lastTokens }
        this.lastTokens = this.summaryTokens
        this.summaryParts.clear()
        this.summaryTokens = null
        this.compactTrigger = null
        return [event]
      }
      case 'session.status': {
        const status = event.properties.status
        if (status.type === 'idle') this.idle = true
        if (status.type !== 'retry' || this.gaveUpWith) return []
        const retry = { attempt: status.attempt, reason: status.message, waitMs: status.next - this.now() }
        this.gaveUpWith = retryGiveUp(retry) ?? undefined
        return this.gaveUpWith ? [] : [{ type: 'notice', notice: retryNotice(retry) }]
      }
      case 'session.idle':
        this.idle = true
        return []
      default:
        return []
    }
  }

  /** The turn's closing status event. */
  finish(stopped?: string): RunEvent {
    if (this.gaveUpWith) return { type: 'status', status: 'failed', error: this.gaveUpWith }
    if (this.aborted) return { type: 'status', status: 'cancelled', error: 'Cancelled' }
    if (stopped && !this.idle) return { type: 'status', status: 'failed', error: `The turn ended because ${stopped}.` }
    if (this.error) return { type: 'status', status: 'failed', error: this.error }
    const u = this.usage
    return {
      type: 'status',
      status: 'completed',
      ...(this.model ? { model: this.model } : {}),
      ...(this.sawUsage ? { usage: { ...u, totalTokens: u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens } } : {}),
    }
  }

  /** A text part after an earlier one (the reply resumes after tool calls) starts a new paragraph. */
  private textOf(firstOfPart: boolean, text: string): string {
    const joined = firstOfPart && this.textStarted ? `\n\n${text}` : text
    this.textStarted = true
    return joined
  }

  private noteError(error: OpenCodeError): void {
    if (error.name === 'MessageAbortedError') this.aborted = true
    else this.error ??= openCodeErrorText(error)
  }

  private part(part: OpenCodePart): RunEvent[] {
    if (part.type === 'compaction') {
      this.compactTrigger = part.auto ? 'auto' : 'manual'
      return []
    }
    if (this.roles.get(part.messageID) !== 'assistant') return []
    if (this.summaries.has(part.messageID) && part.type === 'text') {
      this.summaryParts.set(part.id, part.text)
      return []
    }
    if (this.summaries.has(part.messageID) && part.type === 'reasoning') return []
    switch (part.type) {
      case 'text':
      case 'reasoning': {
        if (part.type === 'text' && part.synthetic) return []
        this.kinds.set(part.id, part.type)
        const already = this.sent.get(part.id) ?? 0
        if (part.text.length <= already) return []
        const rest = part.text.slice(already)
        this.sent.set(part.id, part.text.length)
        return [part.type === 'text' ? { type: 'text_delta', textDelta: this.textOf(already === 0, rest) } : { type: 'thinking', thinking: rest }]
      }
      case 'step-finish': {
        const t = part.tokens
        this.sawUsage = true
        this.usage.inputTokens += t.input ?? 0
        this.usage.outputTokens += (t.output ?? 0) + (t.reasoning ?? 0)
        this.usage.cacheReadTokens += t.cache?.read ?? 0
        this.usage.cacheWriteTokens += t.cache?.write ?? 0
        if (this.summaries.has(part.messageID)) this.summaryTokens = t.output ?? null
        else this.lastTokens = t.total || (t.input ?? 0) + (t.output ?? 0) + (t.cache?.read ?? 0) + (t.cache?.write ?? 0)
        // A step is one round trip with the model; a step part's later updates are not new ones.
        if (this.steps.has(part.id)) return []
        this.steps.add(part.id)
        return [{ type: 'model_round_trip' }]
      }
      case 'tool':
        return this.tool(part)
      default:
        return []
    }
  }

  private tool(part: Extract<OpenCodePart, { type: 'tool' }>): RunEvent[] {
    const call = this.calls.get(part.callID) ?? { announced: false, finished: false }
    this.calls.set(part.callID, call)
    const state = part.state
    if (state.status === 'pending' || call.finished) return []
    const out: RunEvent[] = []
    if (!call.announced) {
      call.announced = true
      out.push({
        type: 'tool_call',
        toolUseId: part.callID,
        toolName: platformToolName(part.tool, this.connectionName) ?? part.tool,
        toolInput: state.input,
      })
    }
    if (state.status === 'completed' || state.status === 'error') {
      call.finished = true
      out.push({ type: 'tool_result', toolUseId: part.callID, output: state.status === 'completed' ? state.output : state.error })
    }
    return out
  }
}
