/**
 * The dashboard's words (board *Proposal*, 6): what needs you, with the page that has the fix; HQ as the hub; each
 * site in one line under it; and the fleet's totals.
 */
import { HQ_PATH, sitePath } from '../../shell/menu'
import { changeWords, pendingChanges } from './overview'
import type { FleetHost, FleetResponse } from './types'
import { describeHost, diskUsedPercent, runsSite, whenIs } from './words'

/** Past this many sites the drawing becomes a compact list under HQ, with a search. */
export const COMPACT_AFTER = 20

/** A nightly backup older than this is overdue: one night missed, with room for a late one. */
export const BACKUP_OVERDUE_MS = 36 * 60 * 60_000
const DAY = 24 * 60 * 60_000

export const LINK_WORDS: Record<FleetResponse['console']['hq'], string> = {
  connecting: 'The Fleet Console is connecting to HQ.',
  connected: '',
  disconnected: 'The Fleet Console has lost its connection to HQ. It tries again by itself.',
  refused: "HQ refused the Fleet Console. A machine admin sets this right on the Fleet Console's machine.",
  versionMismatch: 'HQ and the Fleet Console are on versions that do not work together. Upgrade the older one.',
}

export type NeedsYou = { key: string; title: string; text: string; to: string; action: string }

const HQ_TITLE: Partial<Record<string, string>> = { suspended: 'HQ is suspended', erased: 'HQ is erased' }

const hqInstall = (h: FleetHost | undefined) => h?.figures?.installs.find(i => i.target === 'hq')

/** What needs a fleet admin, each with the page where it is fixed: HQ first, then the sites in the menu's order. */
export function needsYou(fleet: FleetResponse, now: Date): NeedsYou[] {
  const items: NeedsYou[] = []
  const hqHost = fleet.hosts.find(h => h.hqMachine)
  if (fleet.console.hq !== 'connected') {
    items.push({ key: 'hq-link', title: 'HQ is not answering', text: `${LINK_WORDS[fleet.console.hq]} The figures below are what was last known.`, to: HQ_PATH, action: 'Open HQ' })
  }
  const hq = hqInstall(hqHost)
  const hqUnwell = hqHost?.online === true && hq !== undefined && !hq.healthy && hq.state !== 'starting'
  if (hqUnwell) items.push({ key: 'hq', title: HQ_TITLE[hq.state] ?? 'HQ needs attention', text: hq.problem ?? `HQ is ${hq.state}.`, to: HQ_PATH, action: 'Open HQ' })
  for (const h of steadyOrder(fleet.hosts)) {
    // HQ's own trouble is said once, as HQ's.
    if (h.hqMachine && hqUnwell) continue
    const words = describeHost(h, now)
    if (!words.attention) continue
    items.push({ key: h.fingerprint, title: `${h.machineName} — ${words.attention}`, text: words.sentence, to: sitePath(h.fingerprint), action: `Open ${h.machineName}` })
  }
  return items
}

/** The menu's order: HQ's site first, then by name, so a site is always where it was last seen. */
export function steadyOrder(hosts: readonly FleetHost[]): FleetHost[] {
  return [...hosts].sort((a, b) => Number(b.hqMachine) - Number(a.hqMachine) || a.machineName.localeCompare(b.machineName))
}

/** The sites HQ has, its own included, and how many of them are connected now. */
export function sitesConnected(hosts: readonly FleetHost[]): { connected: number; total: number } {
  const sites = hosts.filter(runsSite)
  return { connected: sites.filter(h => h.online && !h.leftByItself).length, total: sites.length }
}

export const siteTag = (h: FleetHost): string => (h.hqMachine ? "HQ's site" : runsSite(h) ? 'Site' : 'No site')

/** A nightly backup that failed, or has not happened for longer than a night: null while backups are on time. */
export function backupLate(h: FleetHost, now: Date): string | null {
  const b = h.figures?.backups
  if (!b || !runsSite(h)) return null
  if (b.lastNightlyOk === false) return 'last backup failed'
  if (!b.lastNightlyAt) return null
  const ms = now.getTime() - Date.parse(b.lastNightlyAt)
  if (ms < BACKUP_OVERDUE_MS) return null
  const days = Math.max(1, Math.floor(ms / DAY))
  return `not backed up for ${days} ${days === 1 ? 'day' : 'days'}`
}

/** A site in one line under HQ: what it is, its runs, its disk, then a planned change or an overdue backup. */
export function siteLine(h: FleetHost, now: Date): string {
  const parts = [siteTag(h)]
  if (runsSite(h) && h.agents) parts.push(`${h.agents.running} of ${h.agents.maxAtOnce} runs`)
  if (h.figures) parts.push(`disk ${diskUsedPercent(h.figures)}%`)
  const late = backupLate(h, now)
  const next = pendingChanges(h)[0]
  if (late) parts.push(late)
  else if (next) parts.push(`${changeWords(next).toLowerCase()} ${whenIs(next.at, now)}`)
  return parts.join(' · ')
}

/** HQ in one line on its hub card: where people reach it, its machine, its sites, its last backup and its version. */
export function hubLine(fleet: FleetResponse, hqHost: FleetHost, now: Date): string {
  const { connected, total } = sitesConnected(fleet.hosts)
  const b = hqHost.figures?.backups
  const backup = b?.lastNightlyAt ? `last backup ${whenIs(b.lastNightlyAt, now)}${b.lastNightlyOk === false ? ', failed' : ''}` : b ? 'no backup yet' : null
  const version = hqInstall(hqHost)?.version
  return [
    fleet.hq?.address,
    `on ${hqHost.machineName}`,
    `${connected} of ${total} ${total === 1 ? 'site' : 'sites'} connected`,
    backup,
    version ? `version ${version}` : null,
  ].filter(Boolean).join(' · ')
}

/** The sites whose nightly backups also go to a backup location, off their own machine. */
export function backupsOffMachine(hosts: readonly FleetHost[]): { off: number; total: number } {
  const sites = hosts.filter(h => runsSite(h) && h.figures)
  return { off: sites.filter(h => h.figures!.backups.locationSet).length, total: sites.length }
}
