import { whenLabel, type PlaceCardState } from '@agenthix/ui/projects'
import type { AgentNow } from '../agentNow'

export type CardNow = { state: PlaceCardState; detail: string | null }

const minutesSince = (iso: string, now: Date) => Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))

export function durationLabel(iso: string, now: Date): string {
  const m = minutesSince(iso, now)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`
}

/** When it last worked: "12 min ago", "2 h ago", the weekday within a week, else the date. */
export function lastWorkedLabel(iso: string, now: Date): string {
  const m = minutesSince(iso, now)
  if (m < 60) return `${m} min ago`
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`
  const at = new Date(iso)
  if (m < 7 * 24 * 60) return at.toLocaleDateString(undefined, { weekday: 'short' })
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** The state that matters most leads — Needs you, Running, Idle — then the detail (spec §3, the Agents card). */
export function agentCardNow(now: AgentNow, projectCount: number, at: Date): CardNow {
  const lead = now.lead
  if (now.state === 'needsYou' && lead) {
    const more = now.needsYouCount > 1 ? ` · +${now.needsYouCount - 1} more` : ''
    return { state: 'needsYou', detail: `${lead.key} ${lead.reason ?? 'needs you'}${more}` }
  }
  if (now.state === 'running' && lead) {
    return { state: 'running', detail: `${lead.title}${lead.since ? ` · ${durationLabel(lead.since, at)}` : ''}` }
  }
  if (now.next) return { state: 'idle', detail: `▶ ${whenLabel(now.next.at, at)}` }
  return { state: 'idle', detail: projectCount === 0 ? 'in no project yet' : null }
}

export function agentCardFacts(
  card: { projectCount: number; lastWorkedAt: string | null; isKernel: boolean; state: PlaceCardState },
  modelLabel: string,
  at: Date,
): string[] {
  const facts = [card.isKernel ? 'Everywhere' : `${card.projectCount} ${card.projectCount === 1 ? 'project' : 'projects'}`, modelLabel]
  if (card.lastWorkedAt && card.state !== 'running') facts.push(`Last worked ${lastWorkedLabel(card.lastWorkedAt, at)}`)
  return facts
}
