import { useId, useState, type KeyboardEvent } from 'react'
import { Search, UserRound } from 'lucide-react'
import { PlaceAvatar } from '@agenthix/ui/primitives'
import { samePlace, type PlaceRef } from './startPlace'
import { PLACE_EXPLANATION, searchPlaces, type PlaceGroup, type PlaceRow } from './placeList'

/**
 * The draft's area (spec §10, the board `new-conversation.html`): the places a conversation can start in, with
 * search at the top. Only the selected place shows its explanation. Searching filters the list but never moves the
 * selection, which stays in view; the arrow keys move through the list from the search box and Enter chooses.
 */
export function DockPlaceList({ groups, here, selected, onChoose }: {
  groups: PlaceGroup[]
  here: PlaceRow
  selected: PlaceRef
  onChoose: (place: PlaceRef) => void
}) {
  const ids = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const searching = query.trim() !== ''
  const found = searching ? searchPlaces(groups, query, selected) : { groups, matched: true }
  const rows = found.groups.flatMap((g) => g.rows)
  const optionId = (row: PlaceRow) => `${ids}-${row.id}`

  const choose = (row: PlaceRow) => {
    setQuery('')
    setActive(-1)
    onChoose(row.ref)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, i + step))))
    } else if (e.key === 'Enter' && rows[active]) {
      e.preventDefault()
      choose(rows[active])
    }
  }

  return (
    <>
      <label className="mx-3 mb-1 mt-3 flex shrink-0 items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-1.5 focus-within:border-accent">
        <Search size={14} aria-hidden className="shrink-0 text-text-muted" />
        <input
          role="combobox"
          aria-label="Find a place"
          aria-expanded
          aria-controls={`${ids}-list`}
          aria-activedescendant={rows[active] ? optionId(rows[active]) : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(-1) }}
          onKeyDown={onKeyDown}
          placeholder="Find a place…"
          className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </label>
      <div id={`${ids}-list`} role="listbox" aria-label="Places" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!found.matched && (
          <p className="px-2 py-3 text-small text-text-muted">
            No place called &apos;{query.trim()}&apos;. You can only start in places you&apos;re a member of.
          </p>
        )}
        {found.groups.map((group, g) => (
          <div key={group.label} role="group" aria-labelledby={`${ids}-g${g}`}>
            <div id={`${ids}-g${g}`} data-group className="px-2 pb-1 pt-2.5 text-micro font-medium uppercase tracking-wide text-text-muted">
              {group.label}
            </div>
            {group.rows.map((row) => {
              const isSelected = samePlace(row.ref, selected)
              return (
                <div
                  key={row.id}
                  id={optionId(row)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(row)}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 ${
                    isSelected ? 'bg-accent-subtle' : rows[active] === row ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                  }`}
                >
                  <PlaceMark row={row} />
                  <div className="min-w-0 flex-1">
                    <div data-name className="truncate text-body font-medium text-text-primary">{row.name}</div>
                    {row.onlyYou && <div data-only-you className="text-micro text-text-muted">Only you</div>}
                    {isSelected && !searching && (
                      <div data-explanation className="mt-0.5 text-small text-text-muted">{PLACE_EXPLANATION[row.ref.kind]}</div>
                    )}
                  </div>
                  {searching && row.id === here.id && <span className="shrink-0 text-micro text-text-muted">you&apos;re here</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

function PlaceMark({ row }: { row: PlaceRow }) {
  if (row.ref.kind === 'project') return <PlaceAvatar kind="project" id={row.id} name={row.name} size="xs" />
  return (
    <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-surface-3 text-text-secondary">
      <UserRound size={12} />
    </span>
  )
}
