/**
 * The time now, as the person reads it, told to the model with the turn's input (walkthrough finding 27): without
 * it, "tomorrow at 9" cannot become the time create_task's `when` takes. Added after the cache breakpoint, so the
 * cached prefix never changes with it.
 */
import type { LeadMessage } from '../contract'

export function clockNote(now: Date, timezone: string | null): string {
  const zone = timezone ?? 'UTC'
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone,
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  const when = `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')}`
  return timezone
    ? `[It is now ${when} in the person's timezone (${timezone}).]`
    : `[It is now ${when} UTC; the person has no timezone set.]`
}

/** The messages with the note joined to the turn's last input, or after it when that message is cached. */
export function withClock(messages: readonly LeadMessage[], note: string, cacheAfterMessage?: number): LeadMessage[] {
  const lastAt = messages.length - 1
  const last = messages[lastAt]
  if (last?.role === 'user' && lastAt !== cacheAfterMessage) {
    return [...messages.slice(0, lastAt), { ...last, content: `${last.content}\n\n${note}` }]
  }
  return [...messages, { role: 'user', content: note }]
}
