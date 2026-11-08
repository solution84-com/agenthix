import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'
import { AudioLines, Building2, Settings, ShieldCheck } from 'lucide-react'
import { Tooltip } from '@agenthix/ui/primitives'
import type { NavIcon } from './NavItem'
import { PLACE_ICONS } from './placeIcons'

export interface MainLink {
  to: string
  label: string
  icon: NavIcon
  active: (pathname: string) => boolean
}

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** Every project's Workroom on one page (D19). */
export const WORKROOMS_HREF = '/workrooms'

/**
 * The app's eleven places in three groups (D20), the rail on a wide screen and the main drawer on a phone: where a person
 * starts and talks; the organisation's work; who does the work and what they can use. Boards, Your tasks, Workspaces,
 * Routines and Workrooms are lists across every project; inside a project its own menu says where the person is.
 */
export const MAIN_GROUPS: MainLink[][] = [
  [
    { to: '/', label: 'Home', icon: PLACE_ICONS.home, active: (p) => p === '/' },
    { to: '/chat', label: 'Chat', icon: PLACE_ICONS.chat, active: (p) => within(p, '/chat') || within(p, '/sessions') },
    { to: '/space', label: 'Your space', icon: PLACE_ICONS.space, active: (p) => within(p, '/space') },
  ],
  [
    { to: '/projects', label: 'Projects', icon: PLACE_ICONS.projects, active: (p) => p === '/projects' },
    { to: '/boards', label: 'Boards', icon: PLACE_ICONS.boards, active: (p) => p === '/boards' },
    { to: '/tasks', label: 'Your tasks', icon: PLACE_ICONS.tasks, active: (p) => within(p, '/tasks') },
    { to: '/workspaces', label: 'Workspaces', icon: PLACE_ICONS.workspaces, active: (p) => p === '/workspaces' },
    { to: '/routines', label: 'Routines', icon: PLACE_ICONS.routines, active: (p) => p === '/routines' },
    { to: WORKROOMS_HREF, label: 'Workrooms', icon: PLACE_ICONS.workrooms, active: (p) => within(p, '/workrooms') },
  ],
  [
    { to: '/agents', label: 'Agents', icon: PLACE_ICONS.agents, active: (p) => within(p, '/agents') },
    { to: '/library', label: 'Library', icon: PLACE_ICONS.library, active: (p) => within(p, '/library') || within(p, '/skills') },
  ],
]

/** The places in order, one list. */
export const MAIN_LINKS: MainLink[] = MAIN_GROUPS.flat()

/** Development builds only: the voice lab, to watch voice while it runs. */
const DEV_LINKS: MainLink[] = import.meta.env.DEV
  ? [{ to: '/dev/voice-lab', label: 'Voice lab', icon: AudioLines, active: (p) => within(p, '/dev/voice-lab') }]
  : []

/** The organisation's administration: below the places, for organisation admins only. */
export const MANAGE_LINK: MainLink = { to: '/admin', label: 'Manage', icon: ShieldCheck, active: (p) => within(p, '/admin') }

/** What sits below the places' divider, ahead of notifications and you. */
export function footLinks(isAdmin: boolean): MainLink[] {
  return isAdmin ? [MANAGE_LINK] : []
}

/** Your menu's links: the organisation's overview, then your own settings. */
export const ORG_MENU_LINKS: MainLink[] = [
  { to: '/org', label: 'Organisation', icon: Building2, active: (p) => within(p, '/org') },
]
export const PERSON_MENU_LINKS: MainLink[] = [
  { to: '/settings', label: 'Your settings', icon: Settings, active: (p) => within(p, '/settings') },
]

/** The user guide, opened from your menu. */
export const GUIDE_URL = 'https://agenthix.com/docs/'

/** A row of the phone's drawer: 44 px to tap, the open one with the selected fill and its icon in the accent. */
export const DRAWER_ROW = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-body transition-colors'
export const drawerRowState = (active: boolean) =>
  active ? 'bg-selected text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'

/** One place: in the rail its icon, named by a tooltip; in the drawer a row with its label. */
export function MainNavLink({ link, rail, onNavigate }: { link: MainLink; rail: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const active = link.active(pathname)
  const Icon = link.icon
  if (!rail) {
    return (
      <Link to={link.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`${DRAWER_ROW} ${drawerRowState(active)}`}>
        <Icon size={18} className={`shrink-0 ${active ? 'text-accent' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
      </Link>
    )
  }
  return (
    <Tooltip label={link.label}>
      <Link
        to={link.to}
        onClick={onNavigate}
        aria-label={link.label}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-selected text-accent font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        <Icon size={18} className={`shrink-0 ${active ? 'text-accent' : ''}`} />
      </Link>
    </Tooltip>
  )
}

/** The places, each marked when it is where the person is, in their three groups with a divider between. */
export function MainNavList({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const groups = DEV_LINKS.length ? [...MAIN_GROUPS, DEV_LINKS] : MAIN_GROUPS
  return (
    <>
      {groups.map((group, i) => (
        <Fragment key={group[0].to}>
          {i > 0 && <div aria-hidden data-testid="places-divider" className={rail ? 'w-6 shrink-0 border-t border-border-subtle my-1' : 'mx-3 my-1.5 shrink-0 border-t border-border-subtle'} />}
          {group.map((l) => <MainNavLink key={l.to} link={l} rail={rail} onNavigate={onNavigate} />)}
        </Fragment>
      ))}
    </>
  )
}
