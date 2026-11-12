/**
 * What the probe found, as the lead reads it: a block appended to the turn's own message, never to the system
 * prompt, so the cached prefix stays the same from turn to turn (memory and knowledge spec, What decides a recall).
 * Certain items in full, a Rule named as one; probable ones by title and key, one line.
 */
import type { LeadMessage } from '../contract'
import type { RecalledItem } from '../../memory/contract'

export interface TurnMemory {
  certain: RecalledItem[]
  probable: { key: string; title: string }[]
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function full(item: RecalledItem): string {
  return `- [${item.key}] ${item.kind === 'RULE' ? 'Rule — ' : ''}${oneLine(item.title)}: ${oneLine(item.body)}`
}

/** `canMark`: the turn has tools, so the lead can say which items it relied on (a report turn has none). */
export function memoryTurnBlock(memory: TurnMemory, canMark: boolean): string | null {
  const { certain, probable } = memory
  if (certain.length + probable.length === 0) return null
  const lines = ['[Memory for this reply — from what you remembered before; the person did not write this]']
  if (certain.length > 0) lines.push('Relevant now:', ...certain.map(full))
  if (probable.length > 0) {
    lines.push(`Possibly relevant (recall by key to read): ${probable.map(p => `${oneLine(p.title)} [${p.key}]`).join('; ')}`)
  }
  if (canMark) lines.push('If your reply relies on any of these, name their keys with used_memory as you finish.')
  return lines.join('\n')
}

/** The block joined to the last message, the turn's own input; added as one when the last is not the person's. */
export function withMemoryBlock(messages: LeadMessage[], block: string | null): LeadMessage[] {
  if (!block) return messages
  const last = messages[messages.length - 1]
  if (last?.role === 'user') return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${block}` }]
  return [...messages, { role: 'user', content: block }]
}
