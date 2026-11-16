import type { LeadRequest, LeadStreamEvent, ModelAdapter, ResolvedAccess } from '../../../../conversations/contract'

export const access = { providerId: 'p', providerName: 'p', provider: 'openai', model: 'm', apiKey: 'k' } as ResolvedAccess

/** A model that makes these calls, one round each, then answers with `text`; every request it was sent is kept. */
export function scripted(
  rounds: Array<Array<{ name: string; input: Record<string, unknown> }>>,
  text = 'Done.',
): ModelAdapter & { seen: LeadRequest[] } {
  const seen: LeadRequest[] = []
  return {
    seen,
    async *stream(request: LeadRequest): AsyncIterable<LeadStreamEvent> {
      seen.push(request)
      const calls = rounds[seen.length - 1] ?? []
      if (calls.length === 0) yield { type: 'text', text }
      for (const [i, c] of calls.entries()) yield { type: 'tool-call', call: { id: `c${seen.length}-${i}`, ...c } }
    },
    complete: async () => { throw new Error('not used') },
  }
}
