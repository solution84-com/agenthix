import { useState } from 'react'
import { BoardCardView } from './BoardCardView'
import { ColumnHeader } from './ColumnHeader'
import { ShowAlsoGroups } from './StackedColumns'
import { BACKLOG_ID, placesOf, type ColumnsViewProps } from './columnsModel'

/** A phone: column chips along the top, and one column at a time below them. */
export function ChipColumns(p: ColumnsViewProps) {
  const places = placesOf(p)
  const [picked, setPicked] = useState<string | null>(null)
  const firstWorking = places.find(x => x.status === 'IN_PROGRESS') ?? places[1] ?? places[0]
  const place = places.find(x => x.id === picked) ?? firstWorking
  const isBacklog = place.id === BACKLOG_ID
  const folded = isBacklog && !!p.backlogFold?.folded
  return (
    <div>
      <div role="tablist" aria-label="Columns" className="flex gap-1.5 overflow-x-auto px-4 py-2">
        {places.map(x => (
          <button
            key={x.id} type="button" role="tab" aria-selected={x.id === place.id} onClick={() => setPicked(x.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-small ${
              x.id === place.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {x.label} {x.cards.length}
          </button>
        ))}
      </div>
      <div className="px-4 py-1.5">
        <ColumnHeader
          column={place} count={place.cards.length} note={place.note}
          onToggleStarts={!isBacklog && p.onToggleStarts ? () => p.onToggleStarts?.(place.id) : undefined}
          startsDisabledReason={p.startsDisabledReason}
          items={isBacklog ? (p.backlogFold ? [{ label: p.backlogFold.folded ? 'Show the Backlog' : 'Hide the Backlog', onSelect: p.backlogFold.toggle }] : []) : []}
          showAlso={isBacklog ? p.showAlsoPicker : undefined}
        />
      </div>
      {!folded && place.cards.length === 0 && <p className="px-4 py-2 text-small text-text-muted">Nothing here.</p>}
      {!folded && <ul className="divide-y divide-border-subtle">
        {place.cards.map(card => (
          <li key={card.id}>
            <BoardCardView card={card} variant="row" now={p.now} onOpen={() => p.onOpen(card)} menu={p.menuFor(card, null)} linkRoutine={p.linkRoutine} linkAgent={p.linkAgent} />
          </li>
        ))}
      </ul>}
      {isBacklog && !folded && <ShowAlsoGroups p={p} />}
    </div>
  )
}
