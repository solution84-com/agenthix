import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronUp, Pin } from 'lucide-react'
import { getPins, useQuery } from 'wasp/client/operations'
import { FootPopover } from '../../shared/components/sidebar/FootPopover'
import { activePinId, rowPinId } from '../pinOrder'
import { usePinnedMemory } from '../pinnedMemory'
import { PinAvatar } from './PinAvatar'
import { PinnedNav } from './PinnedNav'

/**
 * Pinned in the navigation's foot: one row — the pin used last that isn't where you are, how many there are, and ▴ —
 * with the list opening upward from it. The row stays put whatever you choose; with no pins there is no row. At icon
 * width the row is that pin's avatar and the list opens to its right.
 */
export function PinnedFoot({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { data: pins } = useQuery(getPins)
  const { pathname } = useLocation()
  const memory = usePinnedMemory()
  const [peek, setPeek] = useState(false)
  const [editing, setEditing] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  const items = pins ?? []
  if (items.length === 0) return null

  // Icon width has no room to keep the list open: there it opens for one choice, like a menu.
  const open = collapsed ? peek : memory.open
  const toggle = () => (collapsed ? setPeek((v) => !v) : memory.setOpen(!memory.open))
  const shut = () => { setPeek(false); setEditing(false) }
  const here = activePinId(items, pathname)
  const shown = items.find((i) => i.id === rowPinId(items, memory.recent, here)) ?? items[0]
  const follow = (id: string) => () => { memory.used(id); if (collapsed) shut(); onNavigate?.() }

  return (
    <section aria-label="Pinned" className="relative">
      <div className="flex items-center gap-1">
        <Link
          to={shown.href}
          onClick={follow(shown.id)}
          aria-current={shown.id === here ? 'page' : undefined}
          title={collapsed ? shown.name : undefined}
          aria-label={collapsed ? `Pinned: ${shown.name}` : undefined}
          className={`flex items-center gap-2 rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover ${
            collapsed ? 'mx-auto justify-center p-1.5' : 'flex-1 min-w-0 px-2 py-1.5'
          }`}
        >
          <PinAvatar item={shown} />
          {!collapsed && <span className="text-body truncate">{shown.name}</span>}
        </Link>
        {!collapsed && <ListButton button={button} open={open} count={items.length} onClick={toggle} />}
      </div>
      {collapsed && <div className="flex justify-center"><ListButton button={button} open={open} count={items.length} onClick={toggle} collapsed /></div>}
      {open && (
        <FootPopover
          anchor={button}
          side={collapsed ? 'right' : 'top'}
          onClose={shut}
          dismissable={collapsed}
          id="pinned-list"
          data-testid="pinned-list"
        >
          <div className="flex items-center justify-between px-3 pt-2 text-small text-text-muted">
            <span className="flex items-center gap-1.5"><Pin size={12} />Pinned</span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              className="px-1.5 py-0.5 rounded text-small text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
          <div className="p-1.5">
            <PinnedNav editing={editing} onFollow={(id) => follow(id)()} />
          </div>
        </FootPopover>
      )}
    </section>
  )
}

function ListButton({ button, open, count, onClick, collapsed = false }: {
  button: React.RefObject<HTMLButtonElement | null>
  open: boolean
  count: number
  onClick: () => void
  collapsed?: boolean
}) {
  return (
    <button
      ref={button}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="pinned-list"
      aria-label={`Pinned, ${count}`}
      title="All pinned"
      className={`flex items-center gap-1 rounded-lg shrink-0 text-small text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors ${collapsed ? 'p-1' : 'px-2 py-1.5'}`}
    >
      {!collapsed && <span>{count}</span>}
      <ChevronUp size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}
