import type { ComponentType } from 'react'
import { Link } from 'react-router'
import { FOCUS_RING, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'

export type NavIcon = ComponentType<{ size?: number; className?: string }>

export function NavItem({
  to, label, icon: Icon, active, collapsed, onClick, note,
}: {
  to: string
  label: string
  icon: NavIcon
  active: boolean
  collapsed: boolean
  onClick?: () => void
  note?: { full: string; short: string }
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-lg ${FOCUS_RING} ${collapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-2 py-1.5'} ${
        active ? ROW_CHOSEN : `${ROW_ITEM} [&_svg]:text-text-muted hover:[&_svg]:text-text-primary`
      }`}
    >
      <Icon size={17} className="shrink-0" />
      {!collapsed && <span className="text-body whitespace-nowrap flex-1">{label}</span>}
      {note && !collapsed && <span className="text-small text-warning whitespace-nowrap">{note.full}</span>}
      {note && collapsed && (
        <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-warning text-surface-0 text-micro font-medium leading-none">
          {note.short}
        </span>
      )}
    </Link>
  )
}
