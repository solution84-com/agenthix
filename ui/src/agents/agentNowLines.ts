import type { AgentNowData, ComingUpItemData, NowItemData, TaskCountsData } from './projectAgentTypes'

const DAY_MS = 86_400_000

function clock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** When something starts, in the person's zone: "today 09:00", "tomorrow 09:00", "Mon 08:00", or a date. */
export function whenText(iso: string, now: Date): string {
  const at = new Date(iso)
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS)
  if (days === 0) return `today ${clock(at)}`
  if (days === 1) return `tomorrow ${clock(at)}`
  if (days > 1 && days < 7) return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(at)}`
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${clock(at)}`
}

/** How long ago, to the minute or hour or day: "4 min", "2 h". */
export function sinceText(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

export type NowTone = 'needs' | 'live' | 'muted'

/** The state that matters most, with its detail: "Needs you" and what for, "Running" and what, or "Idle". */
export function nowLine(now: AgentNowData, at: Date): { label: string; tone: NowTone; detail: string } {
  const lead = now.lead
  if (now.state === 'needsYou' && lead) return { label: 'Needs you', tone: 'needs', detail: `${lead.key} ${lead.reason ?? lead.title}` }
  if (now.state === 'running' && lead) {
    return { label: 'Running', tone: 'live', detail: [lead.title, lead.since ? sinceText(lead.since, at) : null].filter(Boolean).join(' · ') }
  }
  return { label: 'Idle', tone: 'muted', detail: now.next ? `▶ next ${whenText(now.next.at, at)}` : '' }
}

export function nowItemLine(item: NowItemData, at: Date): string {
  if (item.kind === 'needsYou') return `Needs you${item.reason ? ` · ${item.reason}` : ''}`
  return `Running${item.since ? ` · ${sinceText(item.since, at)}` : ''}`
}

export function comingUpLine(item: ComingUpItemData, at: Date): string {
  return `${item.kind === 'routine' ? 'Routine · ' : ''}▶ ${whenText(item.at, at)}`
}

/** "To do 3 · In progress 2 · Done 14"; "No tasks here" when it has none. */
export function tasksLine(t: TaskCountsData): string {
  if (t.total === 0) return 'No tasks here'
  return [
    t.todo ? `To do ${t.todo}` : null,
    t.inProgress ? `In progress ${t.inProgress}` : null,
    t.done ? `Done ${t.done}` : null,
  ].filter(Boolean).join(' · ')
}
