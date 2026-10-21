import { useLocation } from 'react-router'
import { AudioLines, House, MessageSquare, UserRound, FolderKanban, Bot, CircleDot, Building2, Settings } from 'lucide-react'
import { useShellCounts } from '../../layouts/useShellCounts'
import { NavItem, type NavIcon } from './NavItem'

export interface MainLink {
  to: string
  label: string
  icon: NavIcon
  active: (pathname: string) => boolean
}

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** The places at the top of the navigation, in order. */
export const MAIN_LINKS: MainLink[] = [
  { to: '/', label: 'Home', icon: House, active: (p) => p === '/' },
  { to: '/chat', label: 'Chat', icon: MessageSquare, active: (p) => within(p, '/chat') || within(p, '/sessions') },
  { to: '/space', label: 'Your space', icon: UserRound, active: (p) => within(p, '/space') },
  // Only the list itself: inside a project, the project's pin is what is highlighted.
  { to: '/projects', label: 'Projects', icon: FolderKanban, active: (p) => p === '/projects' },
  { to: '/agents', label: 'Agents', icon: Bot, active: (p) => within(p, '/agents') },
  { to: '/tasks', label: 'Tasks', icon: CircleDot, active: (p) => within(p, '/tasks') },
]

/** Development builds only: the voice lab, to watch voice while it runs. */
const DEV_LINKS: MainLink[] = import.meta.env.DEV
  ? [{ to: '/dev/voice-lab', label: 'Voice lab', icon: AudioLines, active: (p) => within(p, '/dev/voice-lab') }]
  : []

/** The places at the navigation's foot. */
export const FOOT_LINKS: MainLink[] = [
  { to: '/org', label: 'Organisation', icon: Building2, active: (p) => within(p, '/org') },
  { to: '/settings', label: 'Settings', icon: Settings, active: (p) => within(p, '/settings') },
]

/** The navigation's places, each marked when it is where the person is; Tasks says how many need them. */
export function MainNavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const { tasksNeedingYou } = useShellCounts()
  return (
    <>
      {[...MAIN_LINKS, ...DEV_LINKS].map((l) => (
        <NavItem
          key={l.to} to={l.to} label={l.label} icon={l.icon} active={l.active(pathname)} collapsed={collapsed} onClick={onNavigate}
          note={l.to === '/tasks' && tasksNeedingYou > 0 ? { full: `${tasksNeedingYou} need you`, short: String(tasksNeedingYou) } : undefined}
        />
      ))}
    </>
  )
}
