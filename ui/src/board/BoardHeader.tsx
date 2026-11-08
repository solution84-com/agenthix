import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft } from 'lucide-react'
import { FOCUS_RING } from '../primitives/controlStyles'
import { MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from '../primitives/Menus'
import type { ViewChoice } from './types'

/** A plain fact about a board beside its name: *Built in*, *Saved board*, or *Read-only* (outlined). */
export function BoardChip({ children, outlined = false }: { children: ReactNode; outlined?: boolean }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-micro font-medium text-text-secondary ${outlined ? 'border border-border' : 'bg-chip'}`}>
      {children}
    </span>
  )
}

/** The board's name, which opens the project's other boards. */
function BoardSwitcher({ title, boards, current, onPick }: {
  title: string
  boards: ViewChoice[]
  current: string | null
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative min-w-0">
      <h2 className="min-w-0 text-h2 font-semibold text-text-primary">
        <button
          type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
          className={`flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 hover:bg-surface-hover ${OPENS_MENU} ${FOCUS_RING}`}
        >
          <span className="truncate">{title}</span>
          <ChevronDown size={16} aria-hidden className="shrink-0 text-text-muted" />
        </button>
      </h2>
      {open && (
        <PopSheet label="Boards" onClose={() => setOpen(false)} align="left">
          <MenuHeading label="Boards" />
          {boards.map(b => (
            <button
              key={b.value} type="button" role="menuitemradio" aria-checked={b.value === current} className={MENU_ITEM}
              onClick={() => { setOpen(false); onPick(b.value) }}
            >
              <span className="mt-0.5 flex w-4 shrink-0 justify-center text-accent">{b.value === current && <Check size={14} aria-hidden />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.label}</span>
                {b.hint && <span className="block truncate text-micro text-text-muted">{b.hint}</span>}
              </span>
            </button>
          ))}
        </PopSheet>
      )}
    </div>
  )
}

/**
 * A board's header: ‹ Boards (the way back to the list), the board's name opening the other boards, its facts as
 * chips, and under them what it shows and how many tasks; the screen's actions at the right, one of them filled.
 */
export function BoardHeader({ onBack, title, boards, current, onPick, chips, counts, actions, hideOnPhone = false }: {
  onBack: () => void
  title: string
  boards: ViewChoice[]
  current: string | null
  onPick: (key: string) => void
  chips: ReactNode
  /** "Bug's columns · Sprint: current · 4 of 16 tasks shown". */
  counts: string
  actions: ReactNode
  /** Where a phone's top bar already names the board and holds its actions. */
  hideOnPhone?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 px-6 pt-4 ${hideOnPhone ? 'max-lg:hidden' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex h-9 min-w-0 items-center gap-2">
          <button
            type="button" onClick={onBack}
            className={`flex h-9 shrink-0 items-center gap-0.5 rounded-lg pl-1 pr-2 text-small text-text-secondary hover:bg-surface-hover ${FOCUS_RING}`}
          >
            <ChevronLeft size={16} aria-hidden />
            Boards
          </button>
          <BoardSwitcher title={title} boards={boards} current={current} onPick={onPick} />
          <span className="flex shrink-0 items-center gap-2">{chips}</span>
        </div>
        <p className="ml-1 truncate text-small leading-[18px] text-text-muted">{counts}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  )
}
