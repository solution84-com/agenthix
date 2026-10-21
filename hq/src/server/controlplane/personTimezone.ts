/**
 * The timezone a scheduling tool reads a time in when it names none: the
 * timezone of the person the run is on behalf of, taken from who is calling and
 * never from what the agent sends. An explicit `timezone` argument still wins.
 */
import { prisma } from 'wasp/server'
import { normalizeTimezone } from '@agenthix/core'

export interface ReadingZone {
  timezone: string
  /** Set when the zone is a fallback the agent should tell the person about. */
  note?: string
}

export async function personTimezone(userId: string): Promise<string | null> {
  const row = await prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } })
  return normalizeTimezone(row?.timezone)
}

export const noTimezoneNote = (zone: string) =>
  `This person has no timezone on record, so times without one were read in ${zone}. Tell them, and ask which timezone they mean.`

/** `explicit` as given wins (it is validated where the schedule is); then the person's; then `fallback`, which is UTC unless the caller knows better. */
export async function readingZone(explicit: string | undefined, userId: string, fallback = 'UTC'): Promise<ReadingZone> {
  if (explicit) return { timezone: explicit }
  const own = await personTimezone(userId)
  return own ? { timezone: own } : { timezone: fallback, note: noTimezoneNote(fallback) }
}
