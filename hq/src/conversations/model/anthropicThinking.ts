/**
 * The least thinking an Anthropic model takes, for the first step of the reply to a spoken message (voice that stays
 * in the conversation, spec §1 *Reasoning*): Haiku and older Sonnets turn it off; Sonnet 5.5 and later cannot, and
 * think only between tools. The rule follows the models' own capability listing as read in the unit's spike; a model
 * not covered (Opus, Fable) is sent nothing, and thinks as it would.
 *
 * The AI SDK's Anthropic options do not take `between_tools`, so the setting is written into the JSON it sends.
 */
type FetchFunction = typeof globalThis.fetch

export type AnthropicThinking = 'disabled' | 'between_tools'

export function leastThinkingFor(model: string): AnthropicThinking | null {
  if (/haiku/i.test(model)) return 'disabled'
  // A minor version is one or two digits: "claude-sonnet-5-20260101" is Sonnet 5 with a date.
  const sonnet = /sonnet-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(model)
  if (!sonnet) return null
  const major = Number(sonnet[1])
  const minor = Number(sonnet[2] ?? 0)
  return major > 5 || (major === 5 && minor >= 5) ? 'between_tools' : 'disabled'
}

/** A fetch that sets `thinking` on every JSON request body it sends. */
export function thinkingFetch(thinking: AnthropicThinking, base: FetchFunction = globalThis.fetch): FetchFunction {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return base(input, init)
    let parsed: unknown
    try {
      parsed = JSON.parse(init.body)
    } catch {
      return base(input, init)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base(input, init)
    return base(input, { ...init, body: JSON.stringify({ ...(parsed as Record<string, unknown>), thinking: { type: thinking } }) })
  }
}
