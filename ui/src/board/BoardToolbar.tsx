import { useState, type ReactNode } from 'react'
import { ChevronDown, GripVertical, X } from 'lucide-react'
import { CONTROL_HEIGHT, FOCUS_RING } from '../primitives/controlStyles'
import { SearchField } from '../primitives/FilterControls'
import { OPENS_MENU, PopSheet } from '../primitives/Menus'
import { Button } from '../primitives/Button'
import { BoardMenuItems, type BoardMenuItem } from './CardMenu'

/** One of the board's filters: its name, what it is set to (null: not set), and its choices. */
export interface BoardFilterControl {
  id: string
  /** "Sprint". */
  label: string
  /** "Current sprint"; null while it is not set. */
  value: string | null
  choices: BoardMenuItem[]
  onClear: () => void
}

// A filter is a pill, as on the Tasks list: one height and outline for every control in the row.
const PILL = `${CONTROL_HEIGHT} inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface-1 text-small ${FOCUS_RING}`
const CONTROL = `${CONTROL_HEIGHT} inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-surface-1 px-2.5 text-small text-text-secondary hover:bg-surface-hover ${OPENS_MENU} ${FOCUS_RING}`

/** A control that opens a menu under it. */
function MenuButton({ menuLabel, heading, items, className, children, width, align = 'left' }: {
  menuLabel: string
  heading: string
  items: BoardMenuItem[]
  className: string
  children: ReactNode
  width?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={className}>
        {children}
      </button>
      {open && (
        <PopSheet label={menuLabel} onClose={() => setOpen(false)} align={align} width={width}>
          <BoardMenuItems heading={heading} items={items} onClose={() => setOpen(false)} />
        </PopSheet>
      )}
    </div>
  )
}

/** A filter: a button while it is not set; set, a chip with ✕ (B5). */
function FilterPill({ f }: { f: BoardFilterControl }) {
  if (!f.value) {
    return (
      <MenuButton menuLabel={f.label} heading={f.label} items={f.choices} className={`${PILL} pl-3 pr-2.5 text-text-secondary hover:bg-surface-hover ${OPENS_MENU}`}>
        {f.label}
        <ChevronDown size={14} aria-hidden className="text-text-muted" />
      </MenuButton>
    )
  }
  return (
    <span className={`${PILL} pr-1 text-text-primary`}>
      <MenuButton menuLabel={f.label} heading={f.label} items={f.choices} className={`flex h-full items-center rounded-full pl-3 hover:text-accent ${FOCUS_RING}`}>
        <span className="text-text-muted">{f.label}:</span>&nbsp;{f.value}
      </MenuButton>
      <button
        type="button" aria-label={`Clear ${f.label}`} title={`Clear ${f.label}`} onClick={f.onClear}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary ${FOCUS_RING}`}
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  )
}

/** The order of the cards, said where Sort would be: the project's one rank (D14), changed by dragging. */
export function ManualOrderNote() {
  return (
    <span title="Cards are in the project's one order. Drag a card to change it." className="inline-flex items-center gap-1.5 whitespace-nowrap text-small text-text-muted">
      <GripVertical size={14} aria-hidden />
      Manual order
    </span>
  )
}

/**
 * A view changed from what was saved: says so, with Reset, Save as new board… and Save changes. On a built-in board,
 * or where what it groups by changed, Save changes is greyed and says why.
 */
export function ViewChangedControls({ builtIn, saveChangesWhy, onReset, onSaveAsNew, onSaveChanges }: {
  builtIn: boolean
  saveChangesWhy: string | null
  onReset: () => void
  onSaveAsNew: () => void
  onSaveChanges: () => void
}) {
  return (
    <>
      <span className="whitespace-nowrap text-small text-text-muted">Changed from the {builtIn ? 'built-in' : 'saved'} board</span>
      <Button variant="secondary" onClick={onReset}>Reset</Button>
      <Button variant="secondary" onClick={onSaveAsNew}>Save as new board…</Button>
      <Button variant="secondary" disabled={!!saveChangesWhy} title={saveChangesWhy ?? undefined} onClick={onSaveChanges}>Save changes</Button>
    </>
  )
}

/**
 * The board's toolbar (B5, D3): Columns (one control, four ways to plan), the filters as pills, search, and at the
 * right the order or, once the view is changed, the saving controls.
 */
export function BoardToolbar({ columnsLabel, columns, filters, search, onSearch, end }: {
  /** "Bug's columns", "Task state". */
  columnsLabel: string
  columns: BoardMenuItem[]
  filters: BoardFilterControl[]
  search: string
  onSearch: (search: string) => void
  end: ReactNode
}) {
  return (
    <div role="toolbar" aria-label="Columns, filters and search" className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-6 py-4">
      <MenuButton menuLabel="Columns" heading="Columns" items={columns} className={CONTROL} width="sm:w-80">
        Columns:&nbsp;<b className="font-medium text-text-primary">{columnsLabel}</b>
        <ChevronDown size={14} aria-hidden className="text-text-muted" />
      </MenuButton>
      {filters.map(f => <FilterPill key={f.id} f={f} />)}
      <SearchField label="Search this board" value={search} onChange={onSearch} className="min-w-[180px] max-w-[320px] flex-1" />
      <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>
    </div>
  )
}
