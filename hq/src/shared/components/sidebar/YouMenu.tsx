import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { logout } from 'wasp/client/auth'
import { useQuery, getOrgIdentity, getUserSettings } from 'wasp/client/operations'
import { LogOut } from 'lucide-react'
import { FootPopover } from './FootPopover'
import { ORG_MENU_LINKS, PERSON_MENU_LINKS, type MainLink } from './mainNav'

const groupClass = 'px-2.5 pb-0.5 pt-1.5 text-micro font-medium uppercase tracking-wide text-text-muted truncate'
const itemClass = 'flex w-full items-center gap-3 px-2.5 py-2 rounded-md text-body text-left transition-colors'

/** You: your avatar and name, opening a menu grouped by whose each item is: the organisation's (Overview, and Manage for admins), then yours. */
export function YouMenu({ username, collapsed, onNavigate }: { username: string; collapsed: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const { data: org } = useQuery(getOrgIdentity)
  const { data: settings } = useQuery(getUserSettings)
  const isAdmin = settings?.role === 'ADMIN'
  const initials = username.slice(0, 2).toUpperCase()

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  const close = () => setOpen(false)
  const arrow = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (!items.length) return
    e.preventDefault()
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
  }

  const item = (l: MainLink, admin?: boolean) => {
    const active = l.active(pathname)
    return (
      <Link
        key={l.to}
        to={l.to}
        role="menuitem"
        aria-current={active ? 'page' : undefined}
        onClick={() => { close(); onNavigate?.() }}
        className={`${itemClass} ${active ? 'bg-accent-subtle text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
      >
        <l.icon size={16} className={`shrink-0 ${active ? 'text-accent' : ''}`} />
        <span className="flex-1">{l.label}</span>
        {admin && <span className="rounded-full bg-chip px-1.5 text-micro text-text-muted">Admin</span>}
      </Link>
    )
  }

  return (
    <div className={collapsed ? 'relative flex justify-center' : 'relative flex-1 min-w-0'}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${username}, account menu`}
        title={collapsed ? username : undefined}
        className={`flex items-center gap-2 rounded-lg hover:bg-surface-hover transition-colors ${collapsed ? 'p-1' : 'w-full px-2 py-1.5'}`}
      >
        <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-semibold text-small bg-accent-subtle text-accent">
          {initials}
        </span>
        {!collapsed && <span className="text-body text-text-primary truncate flex-1 text-left">{username}</span>}
      </button>
      {open && (
        <FootPopover anchor={trigger} side={collapsed ? 'right' : 'top'} onClose={close} className="p-1" role="menu" aria-label="Account">
          <div ref={menu} onKeyDown={arrow}>
            <p className={groupClass}>{org?.name ?? 'Organisation'}</p>
            {ORG_MENU_LINKS.filter((l) => !l.adminOnly || isAdmin).map((l) => item(l, l.adminOnly))}
            <div role="separator" className="my-1 border-t border-border-subtle" />
            <p className={groupClass}>{username}</p>
            {PERSON_MENU_LINKS.map((l) => item(l))}
            <button
              type="button"
              role="menuitem"
              onClick={() => { close(); void logout() }}
              className={`${itemClass} text-text-secondary hover:text-danger hover:bg-surface-hover`}
            >
              <LogOut size={16} className="shrink-0" />
              Sign out
            </button>
          </div>
        </FootPopover>
      )}
    </div>
  )
}
