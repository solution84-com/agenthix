import { ChevronUp, LogOut, UserRound } from 'lucide-react'
import type { SessionUser } from '../api/session'
import { useSessionDetails } from '../auth/useSessionDetails'
import { ThemeSwitch } from '../components'
import { Link } from '../router'
import { usePopover } from './usePopover'

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

export function Initials({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full bg-linear-135 from-avatar-from to-avatar-to text-[10.5px] font-bold text-on-accent">
      {initialsOf(name)}
    </span>
  )
}

/** The signed-in fleet admin at the foot of the menu, and what they can do about themselves. */
export interface PersonMenuProps {
  user: SessionUser
  onSignOut: () => void
  collapsed: boolean
  /** Your account is open: the person is the current item, not a menu entry. */
  current: boolean
}

export function PersonMenu({ user, onSignOut, collapsed, current }: PersonMenuProps) {
  const { open, setOpen, toggle, ref } = usePopover<HTMLDivElement>()
  const username = useSessionDetails()?.account?.username
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-small text-text-primary hover:bg-surface-hover'
  return (
    <div ref={ref} className="relative -mx-3 -mb-3 mt-2 border-t border-border-subtle">
      {open && (
        <div role="menu" aria-label="You" className={`absolute bottom-full z-20 mb-1.5 rounded-xl border border-border bg-surface-1 p-1.5 shadow-pop ${collapsed ? 'left-2 w-56' : 'inset-x-2.5'}`}>
          {username && (
            <p className="border-b border-border-subtle px-2.5 pb-2 pt-1.5 text-micro text-text-muted">
              Signed in as <b className="font-mono font-semibold text-text-primary">{username}</b>
            </p>
          )}
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)} className={`${item} ${current ? 'bg-selected font-semibold' : ''}`}>
            <UserRound size={15} aria-hidden className="text-text-muted" />Your account
          </Link>
          <div className="px-2.5 py-2"><ThemeSwitch /></div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut() }} className={item}>
            <LogOut size={15} aria-hidden className="text-text-muted" />Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? user.name : undefined}
        className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-surface-hover ${open || current ? 'bg-selected' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
      >
        <Initials name={user.name} />
        {!collapsed && (
          <>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-small font-semibold text-text-primary">{user.name}</span>
              <span className="block text-micro font-medium text-text-muted">fleet admin</span>
            </span>
            <ChevronUp size={13} aria-hidden className={`ml-auto text-text-muted transition-transform ${open ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>
    </div>
  )
}
