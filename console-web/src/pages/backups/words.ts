/**
 * How a site's backups turn into the words on the Backups screens (boards *Backups*, *The backup location: shown here,
 * set on the machine*, *Exporting a backup*; spec §12). Only what the figures carry: the last backup, whether a backup
 * location is set and the last copy there, the last export, and the nightly time. The location's path never leaves
 * the machine, so it is never shown here.
 */
import { BRANDING, parseHostRequest, type BackupSummary, type HostRequest } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'
import type { FleetHost } from '../dashboard/types'
import { GB, MB, possessive, silenceOf, silenceSentence, whenIs } from '../dashboard/words'
import { gbOf } from '../site/words'

export type BackupState = 'noFigures' | 'offline' | 'suspended' | 'failed' | 'none' | 'copied' | 'copyPending' | 'copyMissed' | 'onlyHere'

export type SiteBackupWords = {
  state: BackupState
  /** The site's machine's name — "office-server" — or "HQ" for HQ's machine, whose backup holds HQ and its own site. */
  name: string
  holds: string
  last: string
  location: string
  schedule: string
  pill: { label: string; tone: PillTone }
  /** Whether a command can reach it now: false while its machine is not answering. */
  canAsk: boolean
}

/** Set and changed only on the machine itself (spec §12): the Fleet Console shows the command, never a control. */
export const locationCommand = `${BRANDING.cliCommand} backup location <path>`

type LocationState = Extract<BackupState, 'copied' | 'copyPending' | 'copyMissed' | 'onlyHere'>

const LOCATION_PILL: Record<LocationState, SiteBackupWords['pill']> = {
  copied: { label: 'Sealed · copied', tone: 'healthy' },
  copyPending: { label: 'Location set', tone: 'neutral' },
  copyMissed: { label: 'Copy missed', tone: 'warning' },
  onlyHere: { label: 'No copy elsewhere', tone: 'warning' },
}

const DAY = 86400_000

const exportWords = (lastExportAt: string | null, now: Date): string => {
  if (!lastExportAt) return 'No export has been made.'
  const days = Math.floor((now.getTime() - Date.parse(lastExportAt)) / DAY)
  return days < 1 ? 'The last export was today.' : `The last export was ${days} ${days === 1 ? 'day' : 'days'} ago.`
}

export const carriesHq = (h: FleetHost): boolean => h.hqMachine || (h.figures?.installs.some(i => i.target === 'hq') ?? false)

export function siteBackupWords(h: FleetHost, now: Date): SiteBackupWords {
  const hq = carriesHq(h)
  const name = hq ? 'HQ' : h.machineName
  const holds = hq ? `HQ — its database, storage and secrets — and its own site's database and workspaces, on ${h.machineName}` : "the site's database and workspaces"
  const f = h.figures
  if (!f) {
    return {
      state: 'noFigures', name, holds, last: 'Waiting for its first figures', location: '', schedule: '',
      pill: { label: 'No figures yet', tone: 'neutral' }, canAsk: h.online,
    }
  }
  const b = f.backups
  const lastAt = b.lastNightlyAt ? whenIs(b.lastNightlyAt, now) : null
  const schedule = f.installs.some(i => i.state === 'suspended')
    ? 'Suspended: the nightly backup waits until it resumes.'
    : `Each night at ${b.nightlyAt}, ${possessive(h.machineName)} own time.`
  const base = { name, holds, schedule, canAsk: h.online }

  let location: string
  let state: LocationState
  if (!b.locationSet) {
    state = 'onlyHere'
    location = `No backup location. ${exportWords(b.lastExportAt, now)}`
  } else if (!b.lastCopyAt) {
    state = 'copyPending'
    location = 'A backup location is set; the next backup is the first one copied there'
  } else if (b.lastNightlyAt && Date.parse(b.lastCopyAt) < Date.parse(b.lastNightlyAt)) {
    state = 'copyMissed'
    location = `The last backup did not reach the backup location; the newest copy there is from ${whenIs(b.lastCopyAt, now)}`
  } else {
    state = 'copied'
    location = `In the backup location since ${whenIs(b.lastCopyAt, now)}`
  }

  const silence = silenceOf(h, now)
  if (silence) {
    // As the fleet reads it: stopped, not answering (its fleet admins asked to be told), or only not heard from.
    const since = silenceSentence(silence, now).replace(/\.$/, '')
    const pill = silence.kind === 'stopped' ? { label: 'Stopped', tone: 'neutral' as const }
      : silence.kind === 'notAnswering' ? { label: 'Not answering', tone: 'warning' as const }
      : { label: 'Not heard from', tone: 'neutral' as const }
    return { ...base, state: 'offline', last: lastAt ? `${since} · last backup ${lastAt}` : since, location, pill }
  }
  if (f.installs.some(i => i.state === 'suspended')) {
    return { ...base, state: 'suspended', last: lastAt ? `Last backup ${lastAt}` : 'No backup yet', location, pill: { label: 'Suspended', tone: 'neutral' } }
  }
  if (!lastAt) return { ...base, state: 'none', last: 'No backup yet', location, pill: { label: 'No backup yet', tone: 'neutral' } }
  if (b.lastNightlyOk === false) {
    return { ...base, state: 'failed', last: `The last backup, ${lastAt}, failed`, location, pill: { label: 'Last backup failed', tone: 'danger' } }
  }
  return { ...base, state, last: `Last backup ${lastAt}`, location, pill: LOCATION_PILL[state] }
}

/** On a site with no backup location (board *A site with no backup location*); null when one is set or unknown. */
export function exportWarning(h: FleetHost, now: Date): string | null {
  const b = h.figures?.backups
  if (!b || b.locationSet) return null
  const m = h.machineName
  return `This site's backups are only on ${m}. If ${m} is lost, so are they. ${exportWords(b.lastExportAt, now)} Set a backup location on ${m}, or export a backup now.`
}

/**
 * The Backups page's lede (board *Proposal*, 4): when the nightly backups run — each machine at its own set time, in
 * its own time zone — and how many keep their backups on their own machine only. Null before any figures.
 */
export function backupsLede(hosts: FleetHost[]): string | null {
  const known = hosts.filter(h => h.figures)
  if (known.length === 0) return null
  const times = [...new Set(known.map(h => h.figures!.backups.nightlyAt))]
  const nightly = times.length === 1 ? `Every night at each machine's ${times[0]}.` : 'Every night, at the time each machine is set to.'
  const only = known.filter(h => !h.figures!.backups.locationSet).length
  return `${nightly} ${only} of ${known.length} keep their backups on their own machine only.`
}

/** A request checked against the closed set before it is sent; the parser's own words when it is refused. */
function checked(raw: Record<string, unknown>): HostRequest {
  const parsed = parseHostRequest(raw)
  if (!parsed.ok) throw new Error(parsed.refusal.message)
  return parsed.request
}

export const takeRequest = (): HostRequest => checked({ op: 'backup.take' })
export const exportRequest = (backupId: string): HostRequest => checked({ op: 'backup.export', backupId })

export const sizeWords = (bytes: number): string => (bytes < GB ? `${Math.max(1, Math.round(bytes / MB))} MB` : `${gbOf(bytes)} GB`)

/** What *Take a backup now* answered, in a sentence. */
export function takenWords(b: BackupSummary, machineName: string, locationSet: boolean): string {
  const kept = `Backed up: ${sizeWords(b.sizeBytes)}, sealed, kept on ${machineName}`
  if (b.inLocation) return `${kept}. A copy is in the backup location.`
  return locationSet ? `${kept}. The copy to the backup location did not complete.` : `${kept} only: no backup location is set.`
}

export function keyFileName(siteName: string, night: string): string {
  const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
  return `${slug}-${night}.key`
}

export function keyFileText(key: string, siteName: string, exportId: string): string {
  return [
    `The key for an export of the site ${siteName}.`,
    `It opens ${exportId} and nothing else. Keep it apart from the export.`,
    '',
    key,
    '',
  ].join('\n')
}
