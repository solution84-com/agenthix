/**
 * The Log's decisions (and the held line in the conversation): for each turn, what the lead decided (held, and why; an opening sentence and the work
 * it started; a plain reply; dropped because the person went on) and how long after the turn was sent the hold or the
 * first word came. Read from the conversation's entries and the server's decisions; nothing is guessed on the page.
 */
import type { PlaygroundDecision, PlaygroundEntry } from '../../../shared/voicePlayground'

export type DecisionRow = {
  turnId: string; said: string; outcome: string; detail: string; gap: string
  /** When it was decided, on the server's clock: the hold, else the first text, else the reply's start. */
  at: number
  held: boolean
}

const secs = (ms: number) => `+${(ms / 1000).toFixed(2)} s`

/** The one short sentence a reply that starts work opens with. */
export const firstSentence = (text: string) => (text.trim().match(/^.*?[.!?](?:\s|$)/s)?.[0] ?? text).trim()

export function decisionRows(entries: readonly PlaygroundEntry[], decisions: readonly PlaygroundDecision[]): DecisionRow[] {
  const turns = new Map<string, PlaygroundEntry[]>()
  for (const e of entries) if (e.turnId) turns.set(e.turnId, [...(turns.get(e.turnId) ?? []), e])
  const rows: DecisionRow[] = []
  for (const [turnId, list] of turns) {
    const people = list.filter(e => e.role === 'person')
    const agent = list.find(e => e.role === 'agent')
    if (people.length === 0 || !agent) continue
    const sentAt = Math.max(...people.map(p => p.at))
    const held = decisions.find(d => d.turnId === turnId && d.kind === 'held')
    const work = decisions.filter(d => d.turnId === turnId && d.kind === 'work')
    const said = people.map(p => p.text).join(' ')
    const gap = agent.firstTextAt === undefined ? '' : secs(agent.firstTextAt - sentAt)
    const base = { turnId, said, at: agent.firstTextAt ?? agent.at, held: false }
    if (held) rows.push({ ...base, outcome: 'Held, kept listening', detail: held.text, gap: secs(held.at - sentAt), at: held.at, held: true })
    else if (agent.state === 'RUNNING') rows.push({ ...base, outcome: 'Thinking…', detail: '', gap })
    else if (agent.state === 'FAILED') rows.push({ ...base, outcome: 'Failed', detail: agent.error ?? '', gap })
    else if (agent.withdrawn || (agent.state === 'CANCELLED' && !agent.text)) rows.push({ ...base, outcome: 'Dropped (they went on)', detail: '', gap: '' })
    else if (work.length > 0) {
      const opening = agent.text.trim() ? `“${firstSentence(agent.text)}” · ` : ''
      rows.push({ ...base, outcome: opening ? 'Opening sentence, work started' : 'Work started, no opening sentence', detail: `${opening}work: ${work.map(w => w.text).join(', ')}`, gap })
    } else rows.push({ ...base, outcome: 'Plain reply', detail: agent.text.length > 140 ? `${agent.text.slice(0, 140)}…` : agent.text, gap })
  }
  return rows
}
