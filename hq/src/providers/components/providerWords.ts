import type { AiProviderState, AiProviderSummary, AiProviderType, AiProviderUse } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'
import type { ProviderImpact } from '../impact'

export const STATE_WORDS: Record<AiProviderState, string> = {
  works: 'Works',
  key_refused: 'Key refused',
  out_of_credit: 'Out of credit',
  unreachable: 'Unreachable',
  not_available: 'Not available yet',
  disconnected: 'Disconnected',
}

export const STATE_TONE: Record<AiProviderState, PillTone> = {
  works: 'healthy',
  key_refused: 'danger',
  out_of_credit: 'danger',
  unreachable: 'danger',
  not_available: 'neutral',
  disconnected: 'warning',
}

export const TYPE_WORDS: Record<AiProviderType, string> = { llm: 'LLM', stt: 'STT', tts: 'TTS' }

export const TYPE_CHOICES: Array<{ type: AiProviderType; title: string; line: string }> = [
  { type: 'llm', title: 'LLM provider', line: 'Models: the ones agents think with.' },
  { type: 'stt', title: 'STT provider', line: 'Speech to text: hearing people.' },
  { type: 'tts', title: 'TTS provider', line: 'Text to speech: agents’ voices.' },
]

const SLOT_WORDS = {
  conversation: 'the default conversation model',
  worker: 'the default worker model',
  stt: 'the default speech to text',
  tts: 'the default text to speech',
} as const

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

/** The sentences of a removal or revocation: what falls to what, from the operation's own answer. */
export function impactLines(impact: ProviderImpact): string[] {
  const lines = impact.defaults.map(d => {
    const subject = SLOT_WORDS[d.slot].charAt(0).toUpperCase() + SLOT_WORDS[d.slot].slice(1)
    return d.to ? `${subject} falls to ${d.to.name}, the next allowed, until you choose.` : `${subject} falls to nothing: no other provider of its type works.`
  })
  if (impact.agents.length) {
    const names = impact.agents.map(a => a.name).join(', ')
    lines.push(`${names} ${impact.agents.length === 1 ? 'uses its own choice, which falls' : 'use their own choices, which fall'} to the organisation’s defaults.`)
  }
  for (const t of impact.goesDown) {
    lines.push(`Nothing else provides ${t === 'llm' ? 'models' : t === 'stt' ? 'speech to text' : 'text to speech'}: it is down until a provider is added.`)
  }
  return lines
}

export function keyWords(p: Pick<AiProviderSummary, 'keyHint' | 'credential'>): string | null {
  return p.credential === 'none' || !p.keyHint ? null : `key ending …${p.keyHint}`
}
