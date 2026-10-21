/**
 * What HQ makes of a site's restore report (core's siteRestore.ts; host-management spec §12): which workspaces it
 * had placed on the site are gone — lost with the site's machine, when the site was restored — and which the site
 * holds that HQ has no placement for, which a restored HQ takes back when it knows their owner and otherwise tells
 * its organisation admins about. Pure, so the words and the sums are tested without a database.
 */
import type { SiteRestoredFrom, SiteRestoreWorkspace } from '@agenthix/core'

export type RestoreComparison = {
  lost: string[]
  takeBack: SiteRestoreWorkspace[]
  unrecognised: SiteRestoreWorkspace[]
}

export function compareRestore(
  report: { restored: SiteRestoredFrom | null; workspaces: SiteRestoreWorkspace[] },
  placedHere: string[],
  ownerKnown: (w: SiteRestoreWorkspace) => boolean,
): RestoreComparison {
  const held = new Set(report.workspaces.map(w => w.id))
  const placed = new Set(placedHere)
  const unplaced = report.workspaces.filter(w => !placed.has(w.id))
  return {
    // Only a restored site has lost anything: otherwise a placement it lacks is not this check's to explain.
    lost: report.restored ? placedHere.filter(id => !held.has(id)) : [],
    takeBack: unplaced.filter(ownerKnown),
    unrecognised: unplaced.filter(w => !ownerKnown(w)),
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** `night of 12 October, 02:00` from the night (`YYYY-MM-DD`) and when the backup was taken. */
function nightAndTime(r: SiteRestoredFrom, timeZone?: string): { night: string; time: string } {
  const [, mo, d] = r.night.split('-').map(Number)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(r.takenAt))
  return { night: `night of ${d} ${MONTHS[mo - 1]}`, time }
}

export function restoredNotice(site: string, r: SiteRestoredFrom, lost: number, timeZone?: string): { title: string; body: string } {
  const { night, time } = nightAndTime(r, timeZone)
  const what = lost === 0
    ? 'HQ has checked which workspaces it holds; every one HQ placed there is back.'
    : `HQ has checked which workspaces it holds; ${plural(lost, 'workspace')} HQ placed there ${lost === 1 ? 'is' : 'are'} not back.`
  return {
    title: `${site} was restored from a backup`,
    body: `Restored from the ${night}, ${time}. Files changed after ${time} were lost with the machine. ${what}`,
  }
}

export function unrecognisedNotice(site: string, n: number, takenBack: number): { title: string; body: string } {
  const back = takenBack > 0 ? ` HQ took back ${plural(takenBack, 'other workspace')} whose owner it knows.` : ''
  return {
    title: `${site} holds ${plural(n, 'workspace')} HQ does not recognise`,
    body: `${site} holds ${plural(n, 'workspace')} made after the backup HQ was restored from, for an owner HQ has no record of. They stay on the site, and no one in HQ can open them.${back}`,
  }
}
