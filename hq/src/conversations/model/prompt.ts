import { tool, type ModelMessage, type SystemModelMessage, type ToolSet } from 'ai'
import type { LeadMessage, LeadRequest } from '../contract'
import { breakpointPositions, cacheKeyOf, cacheStyleOf } from './caching'

type RequestProviderOptions = NonNullable<SystemModelMessage['providerOptions']>
type CacheRequest = Pick<LeadRequest, 'system' | 'messages' | 'cacheAfterMessage' | 'access'>

/** Anthropic's SDK takes a breakpoint as the message's provider option; OpenRouter's go into the body (`providers.ts`). */
const BREAKPOINT: RequestProviderOptions = { anthropic: { cacheControl: { type: 'ephemeral' } } }

function anthropicBreakpoints(request: CacheRequest): Set<number> {
  return request.access.provider === 'anthropic' ? new Set(breakpointPositions(request)) : new Set()
}

export function systemOf(request: CacheRequest): SystemModelMessage[] {
  const breakpoints = anthropicBreakpoints(request)
  return request.system
    .filter((part) => part.text.length > 0)
    .map((part, index) => ({
      role: 'system' as const,
      content: part.text,
      ...(breakpoints.has(index) ? { providerOptions: BREAKPOINT } : {}),
    }))
}

function toModelMessage(message: LeadMessage): ModelMessage {
  if (message.role === 'user') {
    // Pictures go beside the words as image parts; the words name every shared file either way.
    if (!message.images?.length) return { role: 'user', content: message.content }
    return {
      role: 'user',
      content: [
        { type: 'text', text: message.content },
        ...message.images.map(i => ({ type: 'image' as const, image: i.data, mediaType: i.mediaType })),
      ],
    }
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: [
        { type: 'tool-result', toolCallId: message.toolCallId, toolName: message.toolName, output: { type: 'json', value: asJson(message.result) as never } },
      ],
    }
  }
  const calls = message.toolCalls ?? []
  if (calls.length === 0) return { role: 'assistant', content: message.content }
  return {
    role: 'assistant',
    content: [
      ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
      // A call made with no arguments arrives without input; the SDK refuses a replayed call that has none.
      ...calls.map((call) => ({ type: 'tool-call' as const, toolCallId: call.id, toolName: call.name, input: asJson(call.input ?? {}) })),
    ],
  }
}

/**
 * A value as JSON carries it: the SDK checks a replayed tool call's input and a tool's result as JSON values, and
 * refuses the whole request over one value that is not — a tool's `Date`, say, or an input left undefined.
 */
function asJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

export function messagesOf(request: CacheRequest): ModelMessage[] {
  const breakpoints = anthropicBreakpoints(request)
  const offset = request.system.filter((part) => part.text.length > 0).length
  return request.messages.map((message, index) => {
    const converted = toModelMessage(message)
    return breakpoints.has(offset + index) ? { ...converted, providerOptions: BREAKPOINT } : converted
  })
}

/** Tools without an `execute`: a call ends the step, and the coordinator runs it. */
export function toolsOf(tools: LeadRequest['tools']): ToolSet {
  return Object.fromEntries(tools.map((t) => [t.name, tool({ description: t.description, inputSchema: t.input })]))
}

/** OpenAI's cache key goes through its SDK; OpenRouter's `session_id` through the body (`providers.ts`). */
export function callOptions(request: Pick<LeadRequest, 'access' | 'cacheKey'>): { providerOptions?: RequestProviderOptions } {
  return cacheStyleOf(request.access).key === 'prompt_cache_key'
    ? { providerOptions: { openai: { promptCacheKey: cacheKeyOf(request.cacheKey) } } }
    : {}
}
