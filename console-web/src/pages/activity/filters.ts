/**
 * Finding in the record (Activity): by who did it, by what it was done to — HQ, or a site by its machine — and by
 * kind. HQ records each action under a name and its subject in words, so a site is found by its machine's or its
 * site's name standing as a whole word in the subject; that only narrows the list, it decides nothing.
 */
import type { FleetActivityEntry } from '@agenthix/core'
import type { FleetHost } from '../dashboard/types'
import { whoDid } from './words'

export const KINDS = {
  signIns: 'Signing in and out',
  sites: 'Adding and disconnecting',
  maintenance: 'Maintenance',
  backups: 'Backups',
  moves: 'Moves',
  roles: 'The fleet admin role',
  other: 'Anything else',
} as const
export type ActivityKind = keyof typeof KINDS

const SITES = new Set(['site.addStarted', 'site.added', 'site.addRefused', 'site.registered', 'site.disconnected', 'hq.machineMarked', 'machine.notifySet'])

export function kindOf(action: string): ActivityKind {
  if (action === 'signedIn' || action === 'signedOut') return 'signIns'
  if (action.startsWith('fleetAdmin.')) return 'roles'
  if (SITES.has(action)) return 'sites'
  if (action.startsWith('console.') || /^(site|hq)\.move/.test(action) || action === 'command.move') return 'moves'
  if (action.startsWith('command.backup.')) return 'backups'
  if (action.startsWith('command.')) return 'maintenance'
  return 'other'
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasWord = (text: string, name: string) => name !== '' && new RegExp(`(^|[^\\w.-])${escaped(name)}($|[^\\w-])`).test(text)

/** `''` is everything; `where` is `hq` or a machine's fingerprint. */
export type ActivityFilter = { who: string; where: string; kind: '' | ActivityKind }
export const NO_FILTER: ActivityFilter = { who: '', where: '', kind: '' }

export function whoOptions(entries: readonly FleetActivityEntry[]): string[] {
  return [...new Set(entries.map(e => whoDid(e.by).name))].sort((a, b) => a.localeCompare(b))
}

export function matches(e: FleetActivityEntry, f: ActivityFilter, hosts: readonly FleetHost[]): boolean {
  if (f.who && whoDid(e.by).name !== f.who) return false
  if (f.kind && kindOf(e.action) !== f.kind) return false
  if (f.where === 'hq') return e.action.startsWith('hq.') || hasWord(e.subject, 'HQ')
  if (f.where) {
    const host = hosts.find(h => h.fingerprint === f.where)
    return host !== undefined && (hasWord(e.subject, host.machineName) || hasWord(e.subject, host.siteName))
  }
  return true
}
