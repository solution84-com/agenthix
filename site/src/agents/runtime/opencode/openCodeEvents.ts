/**
 * The part of OpenCode's event stream (`GET /event`) the OpenCode runtime
 * translates into `RunEvent`s — typed from OpenCode 1.18.32's own SDK types
 * (`packages/sdk/js/src/v2/gen/types.gen.ts`) and checked against the streams
 * the phase 3 runs recorded.
 *
 * Every event is `{ id, type, properties }` and names its session in
 * `properties.sessionID`; one server serves many conversations, so the runtime
 * routes by it. What each carries:
 *
 * - `message.part.updated` — a part's whole current state. A tool part is
 *   first announced `pending`, with its call id and tool name and empty input,
 *   then `running` (input), then `completed` or `error`. Only `pending` is sure
 *   to come before the plugin's gate call; the call's arguments reach the gate
 *   through the plugin, never from here. `step-finish` carries a step's tokens.
 * - `message.part.delta` — streamed text for a part (`field: 'text'` for text
 *   and reasoning parts).
 * - `message.updated` — a message's info: the model that ran, its error.
 * - `session.status` — `busy`, `idle`, or `retry` while OpenCode retries a
 *   failed model request itself (about 70 s over five tries for a 429).
 * - `session.idle` — the turn is over.
 * - `session.error` — the turn failed; `MessageAbortedError` after an abort.
 * - `server.instance.disposed` — the stream is about to end; subscribe again.
 * - Summarising the session's memory (`session/compaction.ts`): a user message
 *   carrying a `compaction` part (`auto`), an assistant message marked
 *   `summary: true` whose text is the summary, then `session.compacted`.
 *   A `ContextOverflowError` on `session.error` comes before an automatic one.
 *
 * Everything else (`plugin.added`, `session.diff`, `server.heartbeat`, …) is
 * dropped by `parseOpenCodeEvent`, cheaply.
 */

export type OpenCodeToolState =
  | { status: 'pending'; input: Record<string, unknown>; raw?: string }
  | { status: 'running'; input: Record<string, unknown>; title?: string; time: { start: number } }
  | { status: 'completed'; input: Record<string, unknown>; output: string; title: string; time: { start: number; end: number } }
  | { status: 'error'; input: Record<string, unknown>; error: string; time: { start: number; end: number } }

type PartBase = { id: string; sessionID: string; messageID: string }

export type OpenCodeTokens = { total?: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } }

export type OpenCodePart =
  | (PartBase & { type: 'text'; text: string; synthetic?: boolean })
  | (PartBase & { type: 'reasoning'; text: string })
  /** `tool` is OpenCode's own tool id; `callID` is the provider's, opaque. */
  | (PartBase & { type: 'tool'; callID: string; tool: string; state: OpenCodeToolState })
  | (PartBase & { type: 'step-finish'; reason: string; cost: number; tokens: OpenCodeTokens })
  /** On the user message that asks OpenCode to summarise: `auto` when it did so on its own. */
  | (PartBase & { type: 'compaction'; auto: boolean; overflow?: boolean })

/** OpenCode's error objects are `{ name, data }`; the names the runtime acts on. */
export type OpenCodeError = {
  name: 'ProviderAuthError' | 'MessageAbortedError' | 'APIError' | 'UnknownError' | 'MessageOutputLengthError' | 'ContextOverflowError' | string
  data: { message?: string; statusCode?: number; isRetryable?: boolean; providerID?: string }
}

export type OpenCodeSessionStatus =
  | { type: 'idle' }
  | { type: 'busy' }
  | { type: 'retry'; attempt: number; message: string; next: number }

export type OpenCodeMessageInfo = {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  modelID?: string
  providerID?: string
  error?: OpenCodeError
  cost?: number
  tokens?: OpenCodeTokens
  /** The assistant message whose text is the session's summary of itself. */
  summary?: boolean
}

export type OpenCodeEvent =
  | { type: 'message.part.updated'; properties: { sessionID: string; part: OpenCodePart; time?: number } }
  | { type: 'message.part.delta'; properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string } }
  | { type: 'message.updated'; properties: { sessionID: string; info: OpenCodeMessageInfo } }
  | { type: 'session.status'; properties: { sessionID: string; status: OpenCodeSessionStatus } }
  | { type: 'session.idle'; properties: { sessionID: string } }
  | { type: 'session.error'; properties: { sessionID?: string; error?: OpenCodeError } }
  | { type: 'server.instance.disposed'; properties: Record<string, unknown> }
  | { type: 'session.compacted'; properties: { sessionID: string } }

export type OpenCodeEventType = OpenCodeEvent['type']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

const PART_TYPES = new Set(['text', 'reasoning', 'tool', 'step-finish', 'compaction'])
const TOOL_STATUSES = new Set(['pending', 'running', 'completed', 'error'])
const SESSION_STATUSES = new Set(['idle', 'busy', 'retry'])

function partOk(p: unknown): boolean {
  if (!isObj(p) || !isStr(p.type) || !PART_TYPES.has(p.type) || !isStr(p.id) || !isStr(p.sessionID) || !isStr(p.messageID)) return false
  if (p.type === 'tool') return isStr(p.callID) && isStr(p.tool) && isObj(p.state) && TOOL_STATUSES.has(p.state.status as string)
  if (p.type === 'step-finish') return isObj(p.tokens)
  if (p.type === 'compaction') return typeof p.auto === 'boolean'
  return isStr(p.text)
}

/**
 * One event of the stream (already JSON-parsed), when it is one the runtime
 * translates and has the fields the runtime reads; null for anything else.
 * Checks shape only as deep as the runtime relies on, so a field OpenCode adds
 * never drops an event.
 */
export function parseOpenCodeEvent(v: unknown): OpenCodeEvent | null {
  if (!isObj(v) || !isStr(v.type) || !isObj(v.properties)) return null
  const p = v.properties
  switch (v.type) {
    case 'message.part.updated':
      return isStr(p.sessionID) && partOk(p.part) ? (v as OpenCodeEvent) : null
    case 'message.part.delta':
      return isStr(p.sessionID) && isStr(p.messageID) && isStr(p.partID) && isStr(p.field) && isStr(p.delta) ? (v as OpenCodeEvent) : null
    case 'message.updated':
      return isStr(p.sessionID) && isObj(p.info) && isStr(p.info.id) ? (v as OpenCodeEvent) : null
    case 'session.status':
      return isStr(p.sessionID) && isObj(p.status) && SESSION_STATUSES.has(p.status.type as string) ? (v as OpenCodeEvent) : null
    case 'session.idle':
    case 'session.compacted':
      return isStr(p.sessionID) ? (v as OpenCodeEvent) : null
    case 'session.error':
      return (p.sessionID === undefined || isStr(p.sessionID)) ? (v as OpenCodeEvent) : null
    case 'server.instance.disposed':
      return v as OpenCodeEvent
    default:
      return null
  }
}

/** The session an event concerns, or null for one that concerns the whole server. */
export function openCodeEventSession(e: OpenCodeEvent): string | null {
  return 'sessionID' in e.properties && isStr(e.properties.sessionID) ? e.properties.sessionID : null
}
