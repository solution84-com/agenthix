/**
 * What a person reads of suspend, resume and erase (host-management spec §15; the CLI board's *Warnings that ask
 * before acting*, *agenthix status* and *agenthix help*). HQ in capitals; commands keep `hq`.
 */
import type { LifecycleStatus } from '../lifecycle/status'
import { fullDate } from './backupWords'
import { whenText } from '../scheduled/time'
import { cmd, nextStep, wrap } from './words'

const IN = '  '
const DAY_MS = 24 * 60 * 60_000

/** `status`: HQ suspended, in place of "Stopped". */
export const hqSuspendedLine = () =>
  nextStep('Suspended. Nothing is lost: its data, backups and credentials are kept. To start it again:', cmd('hq resume'), IN)

/** `status`: the site suspended, on its own or with HQ. */
export function siteSuspendedLine(withHq: boolean): string {
  return withHq
    ? `${wrap('Not running. The site is suspended with HQ; nothing is lost.', IN)}\n${IN}To start both: ${cmd('hq resume')}`
    : `${wrap('Not running. The site is suspended; nothing is lost.', IN)}\n${IN}To start it: ${cmd('site resume')}`
}

/** `status` on a machine whose HQ or site was erased: what the bin keeps, until when, and how to bring it back. */
export function erasedLines(erased: LifecycleStatus['erased']): string[] {
  return erased.flatMap(e => {
    const what = e.target === 'hq' ? `HQ at ${e.hqAddress}` : `The site ${e.siteName}`
    const lines = [
      `${e.target === 'hq' ? 'HQ' : `Site ${e.siteName}`}  erased`,
      nextStep(`${what} was erased on ${fullDate(new Date(e.erasedAt))}. Its final backup is kept until ${fullDate(new Date(e.purgeAfter))}, then purged. To bring it back before then:`, cmd(`${e.target} restore`), IN),
    ]
    if (e.purgeProblem) lines.push(wrap(`The purge is waiting: ${e.purgeProblem}. It is tried again every hour.`, IN))
    return lines
  })
}

/** How many days are left, for `hq restore`'s question. */
export const daysLeft = (purgeAfter: string, now: Date) => Math.max(0, Math.ceil((Date.parse(purgeAfter) - now.getTime()) / DAY_MS))

export type EraseFacts = {
  address: string
  machine: string
  siteName: string
  location: string | null
  /** How many people have an account in HQ; null when HQ does not answer. */
  people: number | null
}

const keptLine = (f: EraseFacts, from: string) => f.location
  ? `It and its copy in the backup location (${f.location}) are kept for 30 days from ${from}`
  : `It is kept on ${f.machine} for 30 days from ${from}`

const purgedLine = (f: EraseFacts) => f.location
  ? 'After that it is all purged, the copy in the backup location included, and cannot be recovered.'
  : 'After that it is purged and cannot be recovered.'

/** The warning before `hq erase`, at once. */
export function hqEraseWarning(f: EraseFacts): string {
  const out = [
    wrap(`This erases HQ at ${f.address} on ${f.machine}: its people, projects, agents and work, and its own site, ${f.siteName}, with it.`),
    '',
    wrap(`First a final sealed backup is taken. ${keptLine(f, 'the erase')}. Until then, ${cmd('hq restore')} brings everything back. ${purgedLine(f)}`),
    '',
  ]
  if (f.people && f.people > 1) {
    out.push(wrap(`${f.people} people use this HQ. They won't be told unless you give notice. Without notice, the first they know is HQ not answering.`))
  }
  out.push('This erases HQ NOW. To give notice instead, press Ctrl-C and run:', `  ${cmd('hq erase --on "<date and time>"')}`, '')
  return out.join('\n')
}

/** The warning before `hq erase --on <date>`. */
export function hqEraseOnWarning(f: EraseFacts, at: Date, now: Date): string {
  const until = fullDate(new Date(at.getTime() + 30 * DAY_MS))
  const when = whenText(at, now)
  return [
    wrap(`This erases HQ at ${f.address} on ${f.machine}: its people, projects, agents and work, and its own site, ${f.siteName}, with it.`),
    '',
    wrap(`On ${when} a final sealed backup is taken. ${keptLine(f, 'then')}, until ${until}. Until then, ${cmd('hq restore')} brings everything back. ${purgedLine(f)}`),
    '',
    wrap(`Notice: from now, everyone in HQ sees "This HQ will be erased on ${when} by a fleet admin. Export what you need, or ask them to cancel."${f.people !== null ? ` ${f.people === 1 ? '1 person' : `${f.people} people`} will see it.` : ''}`),
    '',
  ].join('\n')
}

/** The warning before `site erase`. */
export function siteEraseWarning(siteName: string, machine: string): string {
  return [
    wrap(`This erases the site ${siteName} from ${machine} now. It stops taking part in HQ and runs no agents. Its workspaces and agent containers are removed. A final sealed backup is kept for 30 days; until then ${cmd('site restore')} brings it back, then it is purged. An erased site is not announced ahead: HQ says it has gone.`),
    '',
  ].join('\n')
}

export const erasedHq = (purgeAfter: string) =>
  `Erased. The backup is kept until ${fullDate(new Date(purgeAfter))}.\nTo bring HQ back before then: ${cmd('hq restore')}`

export function erasedSite(siteName: string, purgeAfter: string, hqTold: boolean, hqAddress: string | null): string {
  const until = fullDate(new Date(purgeAfter))
  if (hqTold) return wrap(`Erased. HQ has been told ${siteName} has gone. The backup is kept until ${until}.`)
  return wrap(`Erased here. HQ${hqAddress ? ` at ${hqAddress}` : ''} did not answer, so it still lists ${siteName} as not connected. A fleet admin can remove it there. Your backup is kept until ${until}.`)
}

export const scheduledErase = (id: string, at: Date, now: Date) =>
  `${wrap(`Scheduled. HQ will be erased on ${whenText(at, now)}. The countdown is showing.`)}\nTo cancel before then: ${cmd(`schedule cancel ${id}`)}`

export const suspendedText = (target: 'hq' | 'site') => target === 'hq'
  ? `${wrap('Suspended. HQ and its site are stopped; nothing is lost: data, backups and credentials are kept. HQ told everyone before it stopped.')}\nTo start it again: ${cmd('hq resume')}`
  : `${wrap('Suspended. The site is stopped; nothing is lost. HQ tells the people whose projects run there.')}\nTo start it again: ${cmd('site resume')}`

export const resumedText = (target: 'hq' | 'site') =>
  nextStep(`Resumed. ${target === 'hq' ? 'HQ and its site are' : 'The site is'} starting again. To see how ${target === 'hq' ? 'they are' : 'it is'} doing:`, cmd('status'))
