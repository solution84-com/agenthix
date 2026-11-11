import { useState } from 'react'
import { ChevronDown, Filter, Search } from 'lucide-react'
import { FOCUS_RING } from '../primitives/controlStyles'
import { SearchField } from '../primitives/FilterControls'
import { PLAIN_TRIGGER, PopSheet } from '../primitives/Menus'
import { Button } from '../primitives/Button'
import { BoardMenuItems, type BoardMenuItem } from './CardMenu'
import type { BoardFilterControl } from './BoardToolbar'

// The pickers in plain text, as on a wide screen; 44 px to tap.
const CONTROL = `h-11 min-w-0 ${PLAIN_TRIGGER}`

/** A filter's choices one level down, flattened: a phone's sheet has room for one list at a time. */
function flat(items: BoardMenuItem[]): { label: string; checked?: boolean; onSelect: () => void }[] {
  return items.flatMap(i => i.choices
    ? i.choices.map(c => ({ label: c.label, checked: c.checked, onSelect: c.onSelect }))
    : i.onSelect ? [{ label: i.label, checked: i.checked, onSelect: i.onSelect }] : [])
}

/**
 * A board's view controls on a phone (the board design, phone A and B): Columns, Filter (with how many are set) and
 * search in one toolbar line at the top of the content; Columns and Filter open one sheet, the ways to group then the
 * filters, whose Show N closes it.
 */
export function PhoneBoardToolbar({ columnsLabel, columns, filters, search, onSearch, shownCount, onReset }: {
  columnsLabel: string
  columns: BoardMenuItem[]
  filters: BoardFilterControl[]
  search: string
  onSearch: (search: string) => void
  shownCount: number
  onReset: () => void
}) {
  const [sheet, setSheet] = useState(false)
  const [searching, setSearching] = useState(search !== '')
  const set = filters.filter(f => f.value).length
  const items: BoardMenuItem[] = [
    ...columns.map((c, i) => ({ ...c, groupBefore: i === 0 ? 'Columns' : undefined, separatorBefore: false, hint: undefined })),
    ...filters.map((f, i) => ({
      key: `filter:${f.id}`, label: f.label, value: f.value ?? 'any', separatorBefore: i === 0, groupBefore: i === 0 ? 'Filter' : undefined,
      choices: flat(f.choices),
    })),
  ]
  return (
    <>
      <div role="toolbar" aria-label="Columns, filter and search" className="flex items-center gap-2 px-3 pt-2">
        <button type="button" aria-haspopup="menu" aria-expanded={sheet} onClick={() => setSheet(true)} className={`${CONTROL} flex-1`}>
          <b className="min-w-0 flex-1 truncate text-left font-medium text-text-primary">{columnsLabel}</b>
          <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" />
        </button>
        <button type="button" aria-haspopup="menu" aria-expanded={sheet} onClick={() => setSheet(true)} className={CONTROL}>
          <Filter size={14} aria-hidden />
          {set > 0 ? `Filter · ${set}` : 'Filter'}
        </button>
        <button
          type="button" aria-label="Search this board" title="Search this board" aria-pressed={searching} onClick={() => setSearching(!searching)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed aria-pressed:bg-selected aria-pressed:text-text-primary ${FOCUS_RING}`}
        >
          <Search size={16} aria-hidden />
        </button>
      </div>
      {searching && <div className="px-3 pt-2"><SearchField label="Search this board" value={search} onChange={onSearch} /></div>}
      {sheet && (
        <PopSheet label="Columns and filter" onClose={() => setSheet(false)}>
          <BoardMenuItems heading="Columns and filter" items={items} onClose={() => {}} />
          <div className="flex gap-2 px-1.5 pt-2">
            <Button variant="secondary" className="flex-1 justify-center" onClick={onReset}>Reset</Button>
            <Button className="flex-1 justify-center" onClick={() => setSheet(false)}>Show {shownCount}</Button>
          </div>
        </PopSheet>
      )}
    </>
  )
}
