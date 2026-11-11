import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { logout } from 'wasp/client/auth'
import { useQuery, getOrgIdentity } from 'wasp/client/operations'
import { ChevronRight, CircleHelp, LogOut } from 'lucide-react'
import { INITIALS_MARK, FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM, Tooltip } from '@agenthix/ui/primitives'
import { FootPopover } from './FootPopover'
import { GUIDE_URL, ORG_MENU_LINKS, PERSON_MENU_LINKS, type MainLink } from './mainNav'

const itemClass = `flex w-full items-center gap-3 px-2.5 py-2 rounded-lg text-body text-left ${FOCUS_RING_INSET}`

/**
 * You, at the foot of the rail: your initials (in the phone's drawer, with your name) open your menu: who you are and
 * where, your settings, the organisation, help and the guide, and sign out.
 */
export function YouMenu({ username, rail, onNavigate }: { username: string; rail: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const { data: org } = useQuery(getOrgIdentity)
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

  const item = (l: MainLink) => {
    const active = l.active(pathname)
    return (
      <Link
        key={l.to}
        to={l.to}
        role="menuitem"
        aria-current={active ? 'page' : undefined}
        onClick={() => { close(); onNavigate?.() }}
        className={`${itemClass} ${active ? ROW_CHOSEN : ROW_ITEM}`}
      >
        <l.icon size={16} className="shrink-0" />
        <span className="flex-1">{l.label}</span>
      </Link>
    )
  }

  const avatar = (
    <span className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-small ${INITIALS_MARK}`}>
      {initials}
    </span>
  )

  const button = (
    <button
      ref={trigger}
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`${username}, account menu`}
      className={`flex items-center rounded-lg text-text-secondary ${FOCUS_RING_INSET} not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed transition-colors ${rail ? 'gap-2' : 'w-full min-h-11 gap-3 px-3'}`}
    >
      {avatar}
      {!rail && <span className="text-body text-text-primary truncate flex-1 text-left">{username}</span>}
      {!rail && <ChevronRight size={14} aria-hidden className="shrink-0 text-text-muted" />}
    </button>
  )

  return (
    <div className={rail ? 'relative flex justify-center' : 'relative'}>
      {rail ? <Tooltip label={username} disabled={open}>{button}</Tooltip> : button}
      {open && (
        <FootPopover anchor={trigger} side={rail ? 'right' : 'top'} onClose={close} className="p-1" role="menu" aria-label="Account">
          <div ref={menu} onKeyDown={arrow}>
            <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-2">
              {avatar}
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-text-primary">{username}</p>
                <p className="truncate text-small text-text-muted">{org?.name ?? 'Organisation'}</p>
              </div>
            </div>
            <div role="separator" className="mb-1 border-t border-border-subtle" />
            {PERSON_MENU_LINKS.map(item)}
            {ORG_MENU_LINKS.map(item)}
            <a
              href={GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={close}
              className={`${itemClass} ${ROW_ITEM}`}
            >
              <CircleHelp size={16} className="shrink-0" />
              <span className="flex-1">Help and the guide ↗</span>
            </a>
            <div role="separator" className="my-1 border-t border-border-subtle" />
            <button
              type="button"
              role="menuitem"
              onClick={() => { close(); void logout() }}
              className={`${itemClass} ${ROW_ITEM} hover:text-danger!`}
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
