/**
 * What Where work runs says of a site (host-management spec §10; the HQ board's *Where work runs* and *A site's
 * status*): one word and a sentence of cause, never the machine's figures; runs against capacity; what each run
 * gets; the next scheduled change. Pure, so each wording is tested on its own.
 */
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS, type HostCeilings, type SiteCause } from '@agenthix/core'
import { clockIn, whenIn } from '../scheduled/noticeWords'
import type { ScheduledOnSite, SiteListEntry } from '../siteViews'
import { bytesText, plural, removalText, sinceText, type Tone } from './siteWords'

export const LOOKED_AFTER_BY_FLEET_ADMINS = 'Sites are looked after by your fleet admins, in the Fleet Console.'
export const WHO_ACTS = "Who acts: HQ's machine admin, or your fleet admins."
const TOLD = 'Your fleet admins have been told.'
const GIB = 1024 ** 3

export type Availability = { word: 'Available' | 'Busy' | 'Unavailable' | 'Removed'; sentence: string; tone: Tone }

/** Why hq's own site is not connected, as the headline names it: the cause hq's machine reported, else that it is not running. */
export function causeHeadline(cause: SiteCause | null): string {
  switch (cause) {
    case 'secretTooShort': return 'its pairing secret is too short'
    case 'addressRefused':
    case 'unreachable': return 'it cannot reach HQ'
    case 'credentialStore': return 'it cannot keep its credential'
    case 'credentialRefused': return "HQ doesn't accept its pairing secret"
    case 'versionMismatch': return 'its version does not match HQ'
    default: return 'it is not running'
  }
}

/** The paragraph under the headline on hq's own site's page. */
export function causeExplanation(cause: SiteCause | null, since: Date | null, now = new Date()): string {
  switch (cause) {
    case 'secretTooShort': return 'The pairing secret is too short. HQ and its own site share a pairing secret, which must be at least 32 characters, so they will not pair.'
    case 'addressRefused': return 'The site is running, but it would not send its pairing secret to the address it was given for HQ.'
    case 'unreachable': return 'The site is running, but the address it was given for HQ does not lead to HQ from inside its container.'
    case 'credentialStore': return 'The site cannot keep its credential: its own master key is missing or wrong.'
    case 'credentialRefused': return 'HQ refused the site: its pairing secret is not the one HQ expects.'
    case 'versionMismatch': return 'HQ and the site run versions that do not work together.'
    default: return since ? `The site has stopped. It was connected until ${sinceText(since, now)} and nothing turned it away.` : 'The site has not started yet.'
  }
}

const busy = (site: SiteListEntry) =>
  site.connected && !!site.load && site.load.maxAtOnce > 0 && site.load.running >= site.load.maxAtOnce && (site.waiting.atCapacity ?? 0) > 0

/** The site in a word and a sentence: Available, Busy (every place taken, runs waiting) or Unavailable with its cause. */
export function availability(site: SiteListEntry, now = new Date()): Availability {
  if (site.removal || site.group === 'removed') return { word: 'Removed', sentence: removalText(site, now), tone: 'quiet' }
  const unavailable = (cause: string): Availability => ({ word: 'Unavailable', sentence: cause, tone: 'attention' })
  const refused = site.problems.find(p => p.kind === 'upgrade')
  if (refused) return unavailable(`Unavailable: its software is ${refused.side === 'hq' ? 'newer' : 'older'} than HQ works with. ${TOLD}`)
  if (!site.connected) {
    const since = site.lastSeenAt
    if (site.isDefault) {
      const when = site.cause || !since ? '' : ` since ${sinceText(since, now)}`
      return unavailable(`Unavailable${when}: ${causeHeadline(site.cause)}`)
    }
    if (site.group === 'neverConnected' || !since) return unavailable(`Unavailable: its machine has not connected yet. ${TOLD}`)
    return unavailable(`Unavailable since ${sinceText(since, now)}: its machine isn't answering. ${TOLD}`)
  }
  if (site.problems.some(p => p.kind === 'dockerDown')) return unavailable(`Unavailable: its machine cannot start runs. ${TOLD}`)
  const short = site.problems.flatMap(p => (p.kind === 'diskNearlyFull' ? ['disk'] : p.kind === 'memoryNearlyFull' ? ['memory'] : []))
  if (short.length > 0) {
    return { word: 'Available', sentence: `Available, but it is nearly out of ${short.join(' and ')}; runs may fail. ${TOLD}`, tone: 'attention' }
  }
  if (busy(site)) {
    const waiting = site.waiting.atCapacity ?? 0
    return { word: 'Busy', sentence: `Busy: all ${site.load!.maxAtOnce} runs are going, ${plural(waiting, 'run')} ${waiting === 1 ? 'waits' : 'wait'} for a place`, tone: 'ok' }
  }
  return { word: 'Available', sentence: 'Available', tone: 'ok' }
}

/** "8 GB memory, 4 processors": what each run on a site gets, which every person may see. */
export function runLimitsText(c: HostCeilings): string {
  const memory = c.memoryBytesPerContainer >= GIB
    ? `${Math.round((c.memoryBytesPerContainer / GIB) * 10) / 10} GB`
    : `${Math.round(c.memoryBytesPerContainer / 1024 ** 2)} MB`
  return `${memory} memory, ${plural(c.cpusPerContainer, 'processor')}`
}

const KIND: Record<ScheduledOnSite['kind'], string> = {
  upgrade: 'upgrade', resize: 'resize', restore: 'restore', move: 'move', erase: 'erase', suspend: 'suspension', resume: 'restart',
}

/** "Scheduled maintenance: upgrade Sat 18 Oct at 02:00, about 20 minutes", in the reader's zone. */
export function scheduledLine(s: ScheduledOnSite, zone: string): string {
  const lasting = s.expectedMinutes ? `, about ${plural(s.expectedMinutes, 'minute')}` : ''
  return `Scheduled maintenance: ${KIND[s.kind]} ${whenIn(new Date(s.at), zone)}${lasting}`
}

/** A site's page: the change, and when runs stop starting. */
export function scheduledSentence(s: ScheduledOnSite, zone: string): string {
  const pause = clockIn(new Date(new Date(s.at).getTime() - SCHEDULED_CHANGE_PAUSE_LEAD_MS), zone)
  return `${scheduledLine(s, zone)}. From ${pause} no new runs start there; members of its projects have been told.`
}

/** The second line of a row: what waits, the projects, what each run gets and the scheduled change. */
export function rowDetail(site: SiteListEntry, zone: string): string {
  const away = !site.connected && !site.removal
  const parts = [
    away && site.waiting.runs > 0 ? `${plural(site.waiting.runs, 'run')} wait` : null,
    site.projectCount > 0 || !away ? plural(site.projectCount, 'project') : null,
    site.load?.ceilings ? `runs get ${runLimitsText(site.load.ceilings.ceilings)}` : null,
    site.scheduled ? scheduledLine(site.scheduled, zone) : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** "0 of 6 runs", and "3 waiting" when some wait. Null before the site has reported. */
export function loadText(site: SiteListEntry): { runs: string; waiting: string | null } | null {
  if (!site.load) return null
  const waiting = site.connected ? site.waiting.atCapacity ?? 0 : site.waiting.runs
  return { runs: `${site.load.running} of ${site.load.maxAtOnce} runs`, waiting: waiting > 0 ? `${waiting} waiting` : null }
}

/** The sentence under a site's name on its own page: Busy is explained as nothing wrong, the rest as the list says it. */
export function pageSentence(site: SiteListEntry, now = new Date()): string {
  const a = availability(site, now)
  if (a.word !== 'Busy') return a.sentence
  return `Busy — all ${site.load!.maxAtOnce} runs are going, so new runs wait for a place. Nothing is wrong with the site.`
}

/** Memory and processors each run gets, apart, for the two rows of the page. */
export function limitFacts(c: HostCeilings): { memory: string; processors: string } {
  const [memory, processors] = runLimitsText(c).split(', ')
  return { memory: memory.replace(/ memory$/, ''), processors: processors.replace(/ processors?$/, '') }
}

/**
 * What a fleet admin also reads of a machine (spec §10): disk, Docker and the versions, under the sentence. Empty for
 * anyone else and for Cloud's sites, whose entries the server sends without figures.
 */
export function figureFacts(site: SiteListEntry): { label: string; text: string }[] {
  if (!site.figures) return []
  const h = site.health
  const out: { label: string; text: string }[] = []
  if (h?.disk) out.push({ label: 'Disk', text: `${bytesText(h.disk.freeBytes)} free of ${bytesText(h.disk.totalBytes)}` })
  if (h) {
    out.push({ label: 'Docker', text: `${h.docker.running ? 'Running' : 'Not running'} · ${h.agentImage.present ? `agent image${h.agentImage.version ? ` ${h.agentImage.version}` : ''} ready` : 'agent image not found'}` })
  }
  if (site.protocolVersion) {
    const refused = site.problems.find(p => p.kind === 'upgrade')
    const words = refused ? `HQ speaks ${site.hqProtocol}: upgrade ${refused.side === 'hq' ? 'HQ' : 'the site'}` : 'works with HQ'
    out.push({ label: 'Protocol', text: `${site.protocolVersion} — ${words}` })
  }
  return out
}
