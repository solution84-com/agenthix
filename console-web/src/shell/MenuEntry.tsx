import type { LucideIcon } from 'lucide-react'
import { Link } from '../router'
import type { Dot } from './menu'
import { StateDot } from './StateDot'

export interface MenuEntryProps {
  to: string
  label: string
  icon: LucideIcon
  current: boolean
  collapsed: boolean
  /** The thing's state: a dot beside it, and its words for a screen reader and on hover. */
  state?: { dot: Dot; words: string }
}

/** One entry of the menu: a page, or a thing with its state. Folded to icons, the dot sits on the icon. */
export function MenuEntry({ to, label, icon: Icon, current, collapsed, state }: MenuEntryProps) {
  const hint = state ? `${label} · ${state.words}` : label
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      title={collapsed || state ? hint : undefined}
      className={`relative flex flex-none items-center gap-2.5 rounded-lg py-[7px] text-[13.5px] ${collapsed ? 'w-[38px] justify-center px-0' : 'px-[9px]'} ${current ? 'bg-selected font-semibold text-text-primary' : 'font-medium text-text-secondary hover:bg-surface-hover'}`}
    >
      <Icon size={16} aria-hidden className={`flex-none ${current ? 'text-accent' : 'text-text-muted'}`} />
      <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
      {state && <StateDot dot={state.dot} className={collapsed ? 'absolute top-1 right-1' : ''} />}
      {state && <span className="sr-only">{`, ${state.words}`}</span>}
    </Link>
  )
}
