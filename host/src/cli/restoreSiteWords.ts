/**
 * What the CLI says when a lost site is restored onto this machine from its backup (adr-0119): what comes back, the
 * warning before it, and how it ended. The warning is the owner's: the site's machine may only be down for a while;
 * restoring replaces it, and it is refused when it comes back; what the site did since the backup is lost.
 */
import type { RestoredSite } from '../backups/siteRestore'
import { clock, dayMonth, nightLabel } from './backupWords'
import { cmd, nextStep, wrap } from './words'

/** A site is named after its machine, so one restored onto another machine takes that machine's name. */
const renamed = (siteName: string, machine: string) => (siteName === machine ? '' : ` It is named ${machine} from then on.`)

export function restoreSiteWhat(machine: string, siteName: string, night: string, takenAt: string): string[] {
  const at = new Date(takenAt)
  return [
    wrap(`This brings back on ${machine} the site ${siteName}, as it was on the ${nightLabel(night)} (taken at ${clock(at)}), in place of the machine it ran on.${renamed(siteName, machine)}`),
    '',
    wrap(`Before you go on: ${siteName}'s machine may only be down for a while. Restoring here replaces it — if it comes back, HQ refuses it — and anything ${siteName} did after ${clock(at)} on ${dayMonth(at)} is lost. Every fleet admin and organisation admin is told.`),
  ]
}

/** A site's backup restored without a code: what the machine admin needs first. */
export function restoreSiteNeedsCode(siteName: string, from: string): string {
  return nextStep(
    `This is a backup of the site ${siteName}. It comes back as the same site once a fleet admin lets this machine take its place: in the Fleet Console, Restore from a backup… on ${siteName} gives a code. Then run:`,
    cmd(`restore --from ${from} <hq address> <code>`),
  )
}

export function restoreSiteDone(machine: string, r: RestoredSite): string[] {
  const at = new Date(r.takenAt)
  return [
    wrap(`Restored. ${r.formerName} now runs on ${machine}${r.formerName === r.siteName ? '' : `, and is named ${r.siteName}`}, in place of the machine it ran on; HQ refuses that machine if it comes back.`),
    wrap(`Files changed after ${clock(at)} on ${dayMonth(at)} were lost with the machine. HQ says so on the site as it reconnects.`),
  ]
}
