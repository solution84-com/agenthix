import type { MemoryItemKindValue, MemoryItemView, MemoryMeasurements } from '../../../shared/memory/protocol'

export const KIND_LABELS: Record<MemoryItemKindValue, string> = { FACT: 'Fact', RULE: 'Rule' }

/** The agents badge: the one agent's name, or "Every agent". */
export function agentsLabel(item: Pick<MemoryItemView, 'agent'>): string {
  return item.agent?.name ?? 'Every agent'
}

/** The place badge: the one place's name, or "Everywhere". */
export function placeLabel(item: Pick<MemoryItemView, 'place'>): string {
  return item.place?.name ?? 'Everywhere'
}

/** Of the items brought up, the share an agent relied on; null while none has been judged. */
export function reliedOnShare(m: Pick<MemoryMeasurements, 'used' | 'unused'>): number | null {
  const judged = m.used + m.unused
  return judged === 0 ? null : Math.round((m.used / judged) * 100)
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const dayText = (d: Date, now: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
const timeText = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** A row's date: "today, 19:41", else the day ("6 Nov"; with the year when it is another). */
export function savedDayText(iso: string, now = new Date()): string {
  const d = new Date(iso)
  return sameDay(d, now) ? `today, ${timeText(d)}` : dayText(d, now)
}

export function recalledTimesText(n: number): string {
  if (n === 0) return 'not recalled yet'
  return `recalled ${n} ${n === 1 ? 'time' : 'times'}`
}

/** The dialog's line on where a memory came from: "Kernel saved this in Shop, 6 Nov, 14:02 · recalled 9 times". */
export function savedText(item: Pick<MemoryItemView, 'savedBy' | 'savedIn' | 'createdAt' | 'recallCount'>, now = new Date()): string {
  const d = new Date(item.createdAt)
  // A saved-in place that is gone and one never recorded look alike in the record, so neither is named.
  const where = item.savedIn ? ` in ${item.savedIn.name}` : ''
  return `${item.savedBy?.name ?? 'An agent since deleted'} saved this${where}, ${dayText(d, now)}, ${timeText(d)} · ${recalledTimesText(item.recallCount)}`
}
