import {
  Gauge, Users, Bot, KeyRound, SlidersHorizontal, Server,
} from 'lucide-react'
import type { NavIcon } from '../shared/components/sidebar/NavItem'

export interface AdminMenuEntry {
  to: string
  label: string
  /** Active only at exactly this address, not under it. */
  exact?: boolean
}

export interface AdminMenuGroup {
  /** Shown over the entries; none for a group of one entry that is its own heading. */
  heading: string
  icon: NavIcon
  entries: AdminMenuEntry[]
}

/** The admin area's menu, in order. Each group is one thing an admin manages; Overview is the first screen. */
export const ADMIN_MENU: AdminMenuGroup[] = [
  { heading: 'Overview', icon: Gauge, entries: [{ to: '/admin', label: 'Overview', exact: true }] },
  { heading: 'People', icon: Users, entries: [
    { to: '/admin/people', label: 'People and invitations' },
    { to: '/admin/teams', label: 'Teams' },
  ] },
  { heading: 'Agents', icon: Bot, entries: [{ to: '/admin/agents', label: 'Agents' }] },
  { heading: 'Models and billing', icon: KeyRound, entries: [
    { to: '/admin/ai', label: 'AI' },
    { to: '/admin/billing-profiles', label: 'Billing profiles' },
    { to: '/admin/usage', label: 'Usage' },
  ] },
  { heading: 'Settings', icon: SlidersHorizontal, entries: [
    { to: '/admin/settings', label: 'General', exact: true },
    { to: '/admin/settings/github', label: 'GitHub' },
    { to: '/admin/settings/automation', label: 'Automation' },
    { to: '/admin/settings/runs', label: 'Runs' },
    { to: '/admin/settings/memory', label: 'Memory' },
    { to: '/admin/settings/library', label: 'Library and skills' },
    { to: '/admin/settings/risk-rules', label: 'Tool risk rules' },
  ] },
  { heading: 'Where work runs', icon: Server, entries: [
    { to: '/admin/where-work-runs', label: 'Sites' },
    { to: '/admin/sites-for-projects', label: 'Sites for projects' },
    { to: '/admin/infrastructure', label: 'Infrastructure' },
  ] },
]


const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

export function entryActive(entry: AdminMenuEntry, pathname: string): boolean {
  return entry.exact ? pathname === entry.to : within(pathname, entry.to)
}
