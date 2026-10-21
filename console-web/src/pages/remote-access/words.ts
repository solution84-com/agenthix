import { REMOTE_ACCESS_DEFAULT_MS } from '@agenthix/core'

/** The lengths offered when turning it on (board *Remote access*): 2 hours unless chosen; 8 is the longest. */
export const LENGTHS: readonly { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
]

export const DEFAULT_MINUTES = REMOTE_ACCESS_DEFAULT_MS / 60_000

/** "1 h 18 min", "40 min", "2 hours". */
export function timeLeft(untilIso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((new Date(untilIso).getTime() - now.getTime()) / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "16:00", the hour it switches itself off. */
export const clockOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export const lengthLabel = (minutes: number): string =>
  LENGTHS.find(l => l.minutes === minutes)?.label ?? `${minutes} minutes`
