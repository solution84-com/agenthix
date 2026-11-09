/**
 * Each provider's caching hints (long conversations spec, Caching across providers). Every provider's cache is a
 * prefix cache; the context keeps the front still and lets only the end grow, and this adds what each provider
 * wants on top, as its documentation describes:
 *
 * - Anthropic: explicit breakpoints (`cache_control`), at most four a request, after the instructions, after the
 *   compaction block, at the last message before the turn's input, and at the request's last message — which moves
 *   with a turn's tool loop, so each step reads the one before it. Prefix order is tools → system → messages.
 * - OpenAI: caching is automatic; `prompt_cache_key` routes requests that share a prefix to the same cache.
 * - OpenRouter: `session_id` for sticky routing to the provider holding the cache; for an Anthropic model, the same
 *   breakpoints as `cache_control` on content parts, which OpenRouter passes through. Every other model it serves
 *   caches on its own (OpenAI, Gemini 2.5 and newer, DeepSeek, Grok).
 * - Google (Gemini API): implicit caching, automatic; nothing to send.
 * - An OpenAI-compatible endpoint: no standard hint; nothing is sent, and a stable prefix costs nothing.
 */
import type { LeadRequest, ModelProvider } from '../contract'

/** Anthropic's documented ceiling: more than four `cache_control` blocks in one request is refused. */
export const MAX_BREAKPOINTS = 4
/** OpenRouter's documented limit on `session_id`. */
export const SESSION_ID_MAX_CHARS = 256

export type CacheStyle = {
  /** Explicit breakpoints are sent. */
  breakpoints: boolean
  /** The request carries the conversation's cache key, as this field of the body. */
  key: 'prompt_cache_key' | 'session_id' | null
}

export function cacheStyleOf(access: Pick<LeadRequest['access'], 'provider' | 'model'>): CacheStyle {
  const provider: ModelProvider = access.provider
  switch (provider) {
    case 'anthropic':
      return { breakpoints: true, key: null }
    case 'openai':
      return { breakpoints: false, key: 'prompt_cache_key' }
    case 'openrouter':
      return { breakpoints: servedModel(access.model).startsWith('anthropic/'), key: 'session_id' }
    case 'google':
    case 'openai_compatible':
    case 'inworld':
      return { breakpoints: false, key: null }
  }
}

/** OpenRouter's model id without the runtimes' `openrouter/` prefix: `anthropic/claude-…`. */
function servedModel(model: string): string {
  return model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model
}

/**
 * Where the breakpoints go, as positions in the prompt as sent — the non-empty system parts first, then the
 * messages — each meaning "cache everything up to and including this one". The latest four when there are more:
 * a later breakpoint's prefix holds every earlier one.
 */
export function breakpointPositions(request: Pick<LeadRequest, 'system' | 'messages' | 'cacheAfterMessage'>): number[] {
  const system = request.system.filter((part) => part.text.length > 0)
  const positions = new Set<number>()
  system.forEach((part, index) => {
    if (part.cacheAfter) positions.add(index)
  })
  const { cacheAfterMessage } = request
  if (cacheAfterMessage !== undefined && cacheAfterMessage >= 0 && cacheAfterMessage < request.messages.length) {
    positions.add(system.length + cacheAfterMessage)
  }
  if (request.messages.length > 0) positions.add(system.length + request.messages.length - 1)
  return [...positions].sort((a, b) => a - b).slice(-MAX_BREAKPOINTS)
}

export function cacheKeyOf(key: string): string {
  return key.slice(0, SESSION_ID_MAX_CHARS)
}
