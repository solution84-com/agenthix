import type { SyncBrowserTimezone, SetMyTimezone } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { normalizeTimezone, type SetMyTimezoneArgs, type SyncBrowserTimezoneArgs } from '@agenthix/core'

/**
 * The browser reports its own zone on load. It fills in a timezone the person
 * has not chosen, and follows them when they travel, but never overwrites one
 * they chose themselves (`timezoneChosen`).
 */
export const syncBrowserTimezone: SyncBrowserTimezone<SyncBrowserTimezoneArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const timezone = normalizeTimezone(args?.timezone)
  if (!timezone) throw new HttpError(400, `"${args?.timezone}" is not a timezone`)

  const current = await context.entities.UserSettings.findUnique({
    where: { userId: context.user.id },
    select: { timezone: true, timezoneChosen: true },
  })
  if (current?.timezoneChosen || current?.timezone === timezone) return

  await context.entities.UserSettings.upsert({
    where: { userId: context.user.id },
    update: { timezone },
    create: { userId: context.user.id, role: 'MEMBER', config: {}, timezone },
  })
}

/** The person's own choice from their settings. `null` gives the timezone back to the browser. */
export const setMyTimezone: SetMyTimezone<SetMyTimezoneArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const asked = args?.timezone
  const timezone = asked === null ? null : normalizeTimezone(asked)
  if (asked !== null && !timezone) throw new HttpError(400, `"${asked}" is not a timezone`)
  const chosen = timezone !== null

  await context.entities.UserSettings.upsert({
    where: { userId: context.user.id },
    update: { timezone, timezoneChosen: chosen },
    create: { userId: context.user.id, role: 'MEMBER', config: {}, timezone, timezoneChosen: chosen },
  })
}
