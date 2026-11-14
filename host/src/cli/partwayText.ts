/**
 * An upgrade that has not ended (`upgrades.json`'s `underWay` or `stopping`), as `status` and `scheduled` say it:
 * which version, from which, the backup it kept, and the command that finishes it or puts it back — the same
 * upgrade asked again, which settles the one under way before anything else.
 */
import type { UpgradePartway } from '../upgrades/status'
import { whenText } from '../scheduled/time'
import { nextStep, wrap } from './words'
import { againCommand, builtText } from '../upgrades/builtUpgrade'

const whoOf = (p: UpgradePartway) => (p.target === 'hq' ? 'HQ and its site' : 'the site')

export function partwayLines(p: UpgradePartway | null | undefined, now: Date, indent = ''): string[] {
  if (!p) return []
  const again = againCommand(p.target, p.to, p.built)
  const to = p.built ? builtText(p.built) : p.to
  const from = p.built ? 'the images it ran before' : p.from
  if (p.stage === 'stopping') {
    return [nextStep(`An upgrade to ${to}, from ${from}, stopped ${whoOf(p)} before its backup was taken, so nothing else was changed. ` +
      `The host service starts ${p.target === 'hq' ? 'them' : 'it'} again on ${from} when it next restarts. To start ${p.target === 'hq' ? 'them' : 'it'} again now and try the upgrade again:`, again, indent)]
  }
  if (p.problem) return [wrap(`The upgrade to ${to}, from ${from}, ended part-way. ${p.problem}`, indent)]
  const backup = p.backupTakenAt ? ` The backup taken before it, on ${whenText(new Date(p.backupTakenAt), now)}, is on this machine.` : ''
  return [nextStep(`An upgrade to ${to}, from ${from}, is part-way: it is running, or a restart cut it short.${backup} ` +
    'The host service finishes it, or puts it back, a minute after it next starts. To do it now:', again, indent)]
}

/** The part-way upgrade's line in place of "Stopped" for a part it covers: HQ's covers its site too. */
export function coveredBy(p: UpgradePartway | null | undefined, part: 'hq' | 'site'): boolean {
  return !!p && (p.target === 'hq' || part === 'site')
}
