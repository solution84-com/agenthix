/**
 * OpenRouter's caching hints, written into the Chat Completions body: the AI SDK's OpenAI chat model sends neither
 * `cache_control` on a content part nor `session_id`, so they are added to the JSON it is about to send.
 *
 * The body's messages are the prompt as sent, one for one: each system part, then each message (a tool result is
 * its own `tool` message), so a breakpoint's position is the body message's index.
 */
type FetchFunction = typeof globalThis.fetch

export interface OpenRouterHints {
  /** Positions in the prompt as sent after which a breakpoint goes; empty when the model takes none. */
  breakpoints: number[]
  /** Routes the conversation's requests to the provider that holds its cache. */
  sessionId?: string
  /** No reasoning before the answer (OpenRouter's `reasoning.effort: none`), for a reply spoken aloud. */
  noReasoning?: boolean
}

type BodyMessage = { role?: unknown; content?: unknown }
const EPHEMERAL = { type: 'ephemeral' } as const

/** The message with `cache_control` on its last text part; unchanged when it has no text to mark. */
function marked(message: BodyMessage): BodyMessage {
  const { content } = message
  if (typeof content === 'string') {
    return content.length > 0 ? { ...message, content: [{ type: 'text', text: content, cache_control: EPHEMERAL }] } : message
  }
  if (!Array.isArray(content)) return message
  const last = content.map((p: { type?: unknown }) => p?.type).lastIndexOf('text')
  if (last < 0) return message
  return { ...message, content: content.map((part, i) => (i === last ? { ...part, cache_control: EPHEMERAL } : part)) }
}

export function withOpenRouterCaching(body: Record<string, unknown>, hints: OpenRouterHints): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as BodyMessage[]) : null
  const at = new Set(hints.breakpoints)
  return {
    ...body,
    ...(hints.sessionId ? { session_id: hints.sessionId } : {}),
    ...(hints.noReasoning ? { reasoning: { effort: 'none' } } : {}),
    ...(messages && at.size > 0 ? { messages: messages.map((m, i) => (at.has(i) ? marked(m) : m)) } : {}),
  }
}

/** A fetch that adds the hints to every JSON request body it sends. */
export function openRouterFetch(hints: OpenRouterHints, base: FetchFunction = globalThis.fetch): FetchFunction {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return base(input, init)
    let parsed: unknown
    try {
      parsed = JSON.parse(init.body)
    } catch {
      return base(input, init)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base(input, init)
    return base(input, { ...init, body: JSON.stringify(withOpenRouterCaching(parsed as Record<string, unknown>, hints)) })
  }
}
