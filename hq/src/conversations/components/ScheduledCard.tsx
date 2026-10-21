import { Clock } from 'lucide-react'
import type { StartedMessage } from '../hooks/threadBlocks'

/**
 * When a task set for a time starts, on the reader's clock: "Sun 18 Oct, 9:00" — the words hq's own line uses
 * (coordinator/startedWords.ts, server-side), so the card and the line agree.
 */
export function startsWords(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}, ${Number(part('hour'))}:${part('minute')}`
}

/**
 * A task set for a time, in the turn that set it (walkthrough finding 33): setting it is done, so the card is
 * still — a clock, when it starts, no spinner and no Stop — and drawn for good from what its message holds.
 */
export function ScheduledCard({ message }: { message: StartedMessage }) {
  const { title, boundaryName, startsAt } = message.body
  return (
    <div data-testid="scheduled-card" className="flex max-w-[720px] items-center gap-2 rounded-lg border border-border-subtle px-3 py-2">
      <Clock size={14} aria-hidden className="shrink-0 text-success" />
      <p className="min-w-0 flex-1 truncate text-small text-text-secondary">
        <span className="font-medium text-text-primary">{title}</span>
        {boundaryName && <span> · {boundaryName}</span>}
        {startsAt && <span> · starts {startsWords(startsAt)}</span>}
      </p>
    </div>
  )
}
