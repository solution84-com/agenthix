/**
 * What taking a provider away touches (models from one place, part 1; UI flow 6): which of the organisation's
 * defaults and which agents used it, what each falls to, which types would be left with nothing, and whether a
 * removal is refused for it. Pure, over rows the caller read, so the confirmation and the write say the same.
 *
 * Nothing is re-pointed when a provider goes: a default or an agent's own choice that named it is left empty (the
 * schema's `SetNull`), and the resolver takes the next allowed. What it falls to here is that next provider of the
 * type, one that works first, then the oldest; an agent falls to the organisation's default. Lists that narrow what
 * may run are the resolver's (part 4), so the model it lands on is said by the resolver, not here.
 */
import {
  AI_PROVIDER_VENDOR_INFO, providerStateWorks, providerTypesOf,
  type AiProviderType, type AiProviderUse,
} from '@agenthix/core'
import type { ProviderRow } from './store'

export type DefaultSlot = AiProviderUse['defaults'][number]

export type ProviderImpact = {
  provider: { id: string; name: string }
  /** The organisation's defaults that named it, and the provider each now resolves through; null for nothing. */
  defaults: Array<{ slot: DefaultSlot; to: { id: string; name: string } | null }>
  /** Agents whose own choice named it: each falls to the organisation's default. */
  agents: Array<{ id: string; name: string }>
  /** Types no other provider that works would cover: what goes down. */
  goesDown: AiProviderType[]
  /** Why a removal is refused, or null. A revoke is never refused. */
  removalRefused: string | null
}

const SLOT_TYPE: Record<DefaultSlot, AiProviderType> = { conversation: 'llm', worker: 'llm', stt: 'stt', tts: 'tts' }

const TYPE_WORDS: Record<AiProviderType, string> = { llm: 'model', stt: 'speech-to-text', tts: 'text-to-speech' }

function covers(p: ProviderRow, type: AiProviderType): boolean {
  return providerTypesOf(p.vendor).includes(type)
}

/** The provider new work of this type goes to once `gone` is away. */
export function nextOfType(others: ProviderRow[], type: AiProviderType): ProviderRow | null {
  const of = others.filter(p => covers(p, type))
  return of.find(p => providerStateWorks(p.state)) ?? null
}

/**
 * `setupFinished`: before setup is finished a provider may be taken away freely, since the organisation is still
 * choosing its first ones; after, a removal that leaves a type with no provider at all is refused (D2).
 */
export function impactOf(gone: ProviderRow, all: ProviderRow[], uses: AiProviderUse, setupFinished: boolean): ProviderImpact {
  const others = all.filter(p => p.id !== gone.id)
  const types = providerTypesOf(gone.vendor)
  const named = (p: ProviderRow | null) => (p ? { id: p.id, name: p.name } : null)
  const emptied = setupFinished ? types.filter(t => !others.some(p => covers(p, t))) : []
  return {
    provider: { id: gone.id, name: gone.name },
    defaults: uses.defaults.map(slot => ({ slot, to: named(nextOfType(others, SLOT_TYPE[slot])) })),
    agents: uses.agents,
    goesDown: types.filter(t => nextOfType(others, t) === null),
    removalRefused: emptied.length === 0 ? null
      : `${gone.name} is the organisation's only ${emptied.map(t => TYPE_WORDS[t]).join(', ')} provider, and there must always be one. Add another first, or revoke it if its key may have leaked.`,
  }
}

const SLOT_WORDS: Record<DefaultSlot, string> = {
  conversation: 'The default conversation model',
  worker: 'The default worker model',
  stt: 'The default speech to text',
  tts: 'The default text to speech',
}

/** The impact in sentences, for a record, an announcement and the command line. */
export function impactSentences(i: ProviderImpact): string[] {
  const lines = i.defaults.map(d => `${SLOT_WORDS[d.slot]} falls to ${d.to ? `the next allowed via ${d.to.name}` : 'nothing: no other provider of its type works'}.`)
  if (i.agents.length) lines.push(`${i.agents.map(a => a.name).join(', ')} ${i.agents.length === 1 ? 'falls' : 'fall'} to the organisation's defaults.`)
  for (const t of i.goesDown) lines.push(`Nothing else provides ${TYPE_WORDS[t] === 'model' ? 'models' : TYPE_WORDS[t]}: it is down until a provider is added.`)
  return lines
}

export const vendorLabel = (p: Pick<ProviderRow, 'vendor'>) => AI_PROVIDER_VENDOR_INFO[p.vendor].label
