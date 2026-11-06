import { Link, useLocation } from 'react-router'
import { AudioLines, House, MessageSquare, UserRound, FolderKanban, Kanban, FolderGit2, Repeat, Bot, CircleDot, Library, Building2, Settings, ShieldCheck } from 'lucide-react'
import { useShellCounts } from '../../layouts/useShellCounts'
import { Tooltip } from '@agenthix/ui/primitives'
import { NavItem, type NavIcon } from './NavItem'

export interface MainLink {
  to: string
  label: string
  icon: NavIcon
  active: (pathname: string) => boolean
}

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** The app's places, in order: the rail on a wide screen, the main drawer on a phone. */
export const MAIN_LINKS: MainLink[] = [
  { to: '/', label: 'Home', icon: House, active: (p) => p === '/' },
  { to: '/chat', label: 'Chat', icon: MessageSquare, active: (p) => within(p, '/chat') || within(p, '/sessions') },
  { to: '/space', label: 'Your space', icon: UserRound, active: (p) => within(p, '/space') },
  // Only the list itself: inside a project, the project's menu says where the person is.
  { to: '/projects', label: 'Projects', icon: FolderKanban, active: (p) => p === '/projects' },
  // Boards, Workspaces and Routines across every project; inside one, its own tools list its own.
  { to: '/boards', label: 'Boards', icon: Kanban, active: (p) => p === '/boards' },
  { to: '/tasks', label: 'Tasks', icon: CircleDot, active: (p) => within(p, '/tasks') },
  { to: '/workspaces', label: 'Workspaces', icon: FolderGit2, active: (p) => p === '/workspaces' },
  { to: '/routines', label: 'Routines', icon: Repeat, active: (p) => p === '/routines' },
  { to: '/agents', label: 'Agents', icon: Bot, active: (p) => within(p, '/agents') },
  { to: '/library', label: 'Library', icon: Library, active: (p) => within(p, '/library') || within(p, '/skills') },
]

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

/** One place: in the rail its icon, named by a tooltip; in the drawer a row with its label. */
export function MainNavLink({ link, rail, onNavigate, note }: {
  link: MainLink
  rail: boolean
  onNavigate?: () => void
  note?: { full: string; short: string }
}) {
  const { pathname } = useLocation()
  const active = link.active(pathname)
  if (!rail) return <NavItem to={link.to} label={link.label} icon={link.icon} active={active} collapsed={false} onClick={onNavigate} note={note} />
  const Icon = link.icon
  const name = note ? `${link.label}, ${note.full}` : link.label
  return (
    <Tooltip label={link.label}>
      <Link
        to={link.to}
        onClick={onNavigate}
        aria-label={name}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-selected text-accent font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        <Icon size={18} className={`shrink-0 ${active ? 'text-accent' : ''}`} />
        {note && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-warning text-surface-0 text-micro font-semibold leading-none">
            {note.short}
          </span>
        )}
      </Link>
    </Tooltip>
  )
}

/** The app's places, each marked when it is where the person is; Tasks says how many need them. */
export function MainNavList({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { tasksNeedingYou } = useShellCounts()
  return (
    <>
      {[...MAIN_LINKS, ...DEV_LINKS].map((l) => (
        <MainNavLink
          key={l.to} link={l} rail={rail} onNavigate={onNavigate}
          note={l.to === '/tasks' && tasksNeedingYou > 0 ? { full: `${tasksNeedingYou} need you`, short: String(tasksNeedingYou) } : undefined}
        />
      ))}
    </>
  )
}
