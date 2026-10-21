import { ArrowLeftRight, CalendarClock, CircleHelp, History, LayoutDashboard, ScrollText, Users, type LucideIcon } from 'lucide-react'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { describeHost } from '../pages/dashboard/words'

export type MenuItem = {
  path: string
  label: string
  icon: LucideIcon
}

/**
 * The menu in three parts (board *Proposal*, 7): Dashboard and HQ fixed at the top; every site in the middle, which
 * scrolls; the jobs pinned at the bottom, always in reach however many sites there are.
 */
export const HOME = '/'
export const DASHBOARD: MenuItem = { path: HOME, label: 'Dashboard', icon: LayoutDashboard }

export const JOBS: readonly MenuItem[] = [
  { path: '/maintenance', label: 'Maintenance', icon: CalendarClock },
  { path: '/backups', label: 'Backups', icon: History },
  { path: '/activity', label: 'Activity', icon: ScrollText },
  { path: '/fleet-admins', label: 'Fleet admins', icon: Users },
  { path: '/remote-access', label: 'Remote access', icon: ArrowLeftRight },
  { path: '/help', label: 'Help', icon: CircleHelp },
]

/** Whether a path is a menu entry's page, or a page under it (`/backups/…`). The dashboard is its own path alone. */
export const isAt = (to: string, path: string): boolean => path === to || (to !== HOME && path.startsWith(`${to}/`))

/** A thing's state at a glance, as a dot beside its name; its words go with it, never the dot alone. */
export type Dot = 'healthy' | 'attention' | 'silent' | 'none'

export type MenuSite = { fingerprint: string; name: string; siteName: string; hq: boolean; dot: Dot; state: string }

/** HQ's own page, apart from the sites (board *Proposal*, 1). */
export const HQ_PATH = '/hq'

/** A site's page, HQ's own site's included: the site, then the machine it runs on. */
export const sitePath = (fingerprint: string): string => `/sites/${fingerprint}`

function dotOf(h: FleetHost, now: Date): { dot: Dot; state: string } {
  const words = describeHost(h, now)
  if (words.attention) return { dot: 'attention', state: words.label }
  if (words.state === 'empty') return { dot: 'none', state: words.label }
  if (words.state === 'stopped' || words.state === 'notHeard') return { dot: 'silent', state: words.label }
  return { dot: 'healthy', state: words.label }
}

/** Every site, HQ's own included, named after its machine: HQ's machine's first, then by name, whatever their state. */
export function menuSites(hosts: readonly FleetHost[], now: Date): MenuSite[] {
  return [...hosts]
    .sort((a, b) => Number(b.hqMachine) - Number(a.hqMachine) || a.machineName.localeCompare(b.machineName))
    .map(h => ({ fingerprint: h.fingerprint, name: h.machineName, siteName: h.siteName, hq: h.hqMachine, ...dotOf(h, now) }))
}

/** *Find a site*: by the machine's name or the site's, in any case. */
export function findSites(sites: readonly MenuSite[], find: string): MenuSite[] {
  const q = find.trim().toLowerCase()
  return q ? sites.filter(s => s.name.toLowerCase().includes(q) || s.siteName.toLowerCase().includes(q)) : [...sites]
}

export type MenuHq = { to: string | null; dot: Dot; state: string }

/** HQ's entry: its page, and whether it answers and is well. */
export function menuHq(fleet: FleetResponse | null): MenuHq {
  if (!fleet) return { to: null, dot: 'silent', state: 'Not read yet' }
  const host = fleet.hosts.find(h => h.hqMachine) ?? null
  const to = host ? HQ_PATH : null
  if (fleet.console.hq !== 'connected') return { to, dot: 'attention', state: 'Not answering' }
  const install = host?.figures?.installs.find(i => i.target === 'hq')
  if (install && !install.healthy && install.state !== 'starting') return { to, dot: 'attention', state: 'Needs attention' }
  return { to, dot: 'healthy', state: 'Healthy' }
}
