import type { MemoryItemKindValue, MemoryMeasurements } from '../../../shared/memory/protocol'

export const KIND_LABELS: Record<MemoryItemKindValue, string> = {
  FACT: 'Fact', PREFERENCE: 'Preference', DECISION: 'Decision', FEEDBACK: 'Feedback', PROJECT: 'Project',
}

export function lastRecalledText(iso: string | null, now = new Date()): string {
  if (!iso) return 'Never recalled'
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Recalled today'
  return days === 1 ? 'Recalled yesterday' : `Recalled ${days} days ago`
}

export function hitsText(recalled: number, used: number): string {
  const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`
  return `Recalled ${times(recalled)}, relied on ${times(used)}`
}

/** Of the items brought up, the share an agent relied on; null while none has been judged. */
export function reliedOnShare(m: Pick<MemoryMeasurements, 'used' | 'unused'>): number | null {
  const judged = m.used + m.unused
  return judged === 0 ? null : Math.round((m.used / judged) * 100)
}
