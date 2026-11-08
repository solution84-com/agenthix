import { dayLabel } from '../primitives/DateField'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** When a card on a board last moved: "moved 10 min ago", "moved yesterday", "moved on 3 Oct"; null when none has. */
export function movedWords(at: string | Date | null | undefined, now: Date): string | null {
  if (!at) return null
  const when = new Date(at)
  const ago = now.getTime() - when.getTime()
  if (Number.isNaN(ago)) return null
  if (ago < MINUTE) return 'moved just now'
  if (ago < HOUR) return `moved ${Math.floor(ago / MINUTE)} min ago`
  if (ago < DAY) return `moved ${Math.floor(ago / HOUR)} h ago`
  if (ago < 2 * DAY) return 'moved yesterday'
  if (ago < 7 * DAY) return `moved ${Math.floor(ago / DAY)} days ago`
  return `moved on ${dayLabel(when, now)}`
}

/** "1 needs you", "3 need you". */
export function needsYouWords(count: number): string {
  return `${count} ${count === 1 ? 'needs' : 'need'} you`
}
