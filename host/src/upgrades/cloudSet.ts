/**
 * `upgrades.set` as Cloud's controller asks it (pre-release spec B8): the setting the command line has, with the
 * window in an IANA time zone. It shares its name with the machine admin's own owner-socket `upgrades.set`, which has
 * another shape (`operations.ts`); this one is reached only through the registry on Cloud's link, so the two parsers
 * stay apart and share the code underneath, `setUpgrades`.
 */
import type { CloudMaintenanceWindow, CloudOnlyRequest } from '@agenthix/core'
import { Refusal } from '../owner/results'
import type { CloudOnlyHandler } from '../cloud/handlers'
import { setUpgrades } from './automatic'
import { readUpgrades } from './settings'
import { validTimeZone } from './zoned'

const minute = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24 * 60

function parseWindow(v: unknown): CloudMaintenanceWindow {
  const bad = new Refusal('malformed', 'The maintenance window is not one this reads: a day (0 to 6, or none), two minutes of the day, and a time zone.')
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad
  const w = v as Record<string, unknown>
  const dayOk = w.day === null || (typeof w.day === 'number' && Number.isInteger(w.day) && w.day >= 0 && w.day <= 6)
  if (!dayOk || !minute(w.startMinute) || !minute(w.endMinute) || w.startMinute === w.endMinute) throw bad
  if (typeof w.timeZone !== 'string' || w.timeZone.length > 64 || !validTimeZone(w.timeZone)) throw bad
  return { day: w.day as number | null, startMinute: w.startMinute, endMinute: w.endMinute, timeZone: w.timeZone }
}

export const cloudUpgradesSet: CloudOnlyHandler<'upgrades.set'> = {
  parse: (r): Extract<CloudOnlyRequest, { op: 'upgrades.set' }> => {
    if (typeof r.auto !== 'boolean') throw new Refusal('malformed', 'Whether fixes apply by themselves must be true or false.')
    return { op: 'upgrades.set', auto: r.auto, window: parseWindow(r.window) }
  },
  run: async (ctx, request) => {
    await setUpgrades(ctx, { auto: request.auto, window: request.window })
    const held = readUpgrades(ctx.state)
    const w = held.window
    return { auto: held.auto, window: { day: w.day, startMinute: w.startMinute, endMinute: w.endMinute, timeZone: w.timeZone ?? request.window.timeZone } }
  },
}
