/**
 * A conversation's title, named after its first reply: one short call to the conversation's own model, on the access
 * the turn used, with the person's first message and the reply. It runs after the reply has ended, so it never holds
 * the reply up, and the reply carries nothing for it. A title already there is kept; a call that fails leaves none,
 * and the next reply tries again.
 */
import type { LeadRequest } from '../contract'
import { costedFor } from '../../billing/sources/hqCalls'

const TITLE_INSTRUCTION = 'Name this conversation in three to six words, from what the person asked. Reply with the name only, with no quotes and no full stop.'
const TITLE_MAX = 80

export function titleRequest(input: {
  access: LeadRequest['access']
  ask: string
  reply: string
  conversationId: string
  signal: AbortSignal
}): Omit<LeadRequest, 'tools'> {
  return {
    access: costedFor(input.access, 'title'),
    system: [{ text: TITLE_INSTRUCTION }],
    messages: [{ role: 'user', content: `The person said: ${input.ask}\n\nThe reply: ${input.reply}` }],
    cacheKey: input.conversationId,
    maxOutputTokens: 30,
    // Asks for no reasoning where the provider offers that: a name needs none.
    spoken: true,
    signal: input.signal,
  }
}

/** The name from the model's answer: its first line, without quotes or markup; null when there is none. */
export function titleFrom(answer: string): string | null {
  const line = answer.trim().split('\n', 1)[0] ?? ''
  const name = line.replace(/^(title|name)\s*:\s*/i, '').replace(/[*_`#"“”]/g, '').replace(/[.。]+$/, '').trim()
  return name ? name.slice(0, TITLE_MAX).trim() : null
}
