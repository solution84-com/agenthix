import type { AiProviderState, AiProviderSummary, AiProviderType, AiProviderUse, AiProviderVendor } from '@agenthix/core'
import type { ProviderImpact } from '../impact'

/** What each type is called wherever it shows: what a provider lets agents do. */
export const TYPE_WORDS: Record<AiProviderType, string> = { llm: 'Thinking', stt: 'Hearing', tts: 'Speaking' }

/** A provider's state as a sentence, on its card. */
export const STATE_SENTENCES: Record<AiProviderState, string> = {
  works: 'Works.',
  key_refused: 'The key was refused.',
  out_of_credit: 'Out of credit.',
  unreachable: 'Cannot be reached.',
  not_available: 'Not available yet.',
  disconnected: 'Disconnected.',
}

/** A provider's state on its one line: the reason, when it is not working. */
export const STATE_SHORT_WORDS: Record<AiProviderState, string> = {
  works: 'Works',
  key_refused: 'Key refused',
  out_of_credit: 'Out of credit',
  unreachable: 'Cannot be reached',
  not_available: 'Not available yet',
  disconnected: 'Disconnected',
}

/** What a provider lets agents do, in one phrase: "Thinking, Hearing, Speaking". */
export function kindsWords(types: readonly AiProviderType[]): string {
  return (['llm', 'stt', 'tts'] as const).filter(t => types.includes(t)).map(t => TYPE_WORDS[t]).join(', ')
}

/** The order the add-provider pop-up lists vendors in. Agenthix Cloud is last, and is not keyed. */
export const VENDOR_ORDER: readonly AiProviderVendor[] = ['anthropic', 'openai', 'google', 'openrouter', 'inworld', 'assemblyai', 'openai_compatible']

export const VENDOR_LINES: Record<AiProviderVendor, string> = {
  anthropic: 'Claude models',
  openai: 'GPT models',
  google: 'Gemini models',
  openrouter: 'Many models, free ones included',
  openai_compatible: 'Any OpenAI-compatible server',
  assemblyai: 'Hearing people',
  inworld: 'Thinking, hearing and speaking: one key for all three',
  cloud: 'Thinking, hearing and speaking, no keys. Billed by Agenthix. You approve it with a short code.',
}

/** A default a provider serves, in the capability words: Thinking's default is a model. */
export const SLOT_WORDS: Record<AiProviderUse['defaults'][number], string> = {
  conversation: 'the default model',
  stt: 'the default for Hearing',
  tts: 'the default for Speaking',
}

/** "12 Oct", or "just now" for a minute or less ago. */
export function sinceWords(iso: string, now = new Date()): string {
  const at = new Date(iso)
  if (now.getTime() - at.getTime() < 60_000) return 'just now'
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** What uses a provider, as its line says it; an empty string when nothing does. */
export function usedByWords(use: AiProviderUse): string {
  const parts: string[] = use.defaults.map(slot => SLOT_WORDS[slot])
  if (use.agents.length) parts.push(use.agents.length === 1 ? `the agent ${use.agents[0].name}` : `${use.agents.length} agents`)
  if (parts.length === 0) return ''
  return `Used by ${parts.join(', ')}`
}

const UNCOVERED_WORDS: Record<AiProviderType, string> = {
  llm: 'Agents will have no model until you add another provider.',
  stt: 'Agents will not hear people until you add another provider that does.',
  tts: 'Agents will not speak until you add another provider that does.',
}
const SLOT_TYPE = { conversation: 'llm', stt: 'stt', tts: 'tts' } as const

/** The sentences of a removal or revocation: what moves to what, then what nothing covers any more, from the operation's own answer. */
export function impactLines(impact: ProviderImpact): string[] {
  const lines = impact.defaults.filter(d => d.to).map(d => {
    const subject = SLOT_WORDS[d.slot].charAt(0).toUpperCase() + SLOT_WORDS[d.slot].slice(1)
    return `${subject} falls to ${d.to?.name}, the next allowed, until you choose.`
  })
  if (impact.agents.length) {
    const names = impact.agents.map(a => a.name).join(', ')
    lines.push(`${names} ${impact.agents.length === 1 ? 'uses its own choice, which falls' : 'use their own choices, which fall'} to the organisation’s defaults.`)
  }
  const uncovered = new Set<AiProviderType>([...impact.goesDown, ...impact.defaults.filter(d => !d.to).map(d => SLOT_TYPE[d.slot])])
  for (const t of ['llm', 'stt', 'tts'] as const) if (uncovered.has(t)) lines.push(UNCOVERED_WORDS[t])
  return lines
}

export function keyWords(p: Pick<AiProviderSummary, 'keyHint' | 'credential'>): string | null {
  return p.credential === 'none' || !p.keyHint ? null : `key ending …${p.keyHint}`
}
