import { useState } from 'react'
import { BoardCardView } from './BoardCardView'
import { ColumnHeader } from './ColumnHeader'
import { BACKLOG_ID, placesOf, type ColumnsViewProps, type Place } from './columnsModel'

/** How many tasks a group shows before "N more". */
const FOLD_AT = 5

function PlaceGroup({ place, p, open, onToggleOpen }: { place: Place; p: ColumnsViewProps; open: boolean; onToggleOpen: () => void }) {
  const [all, setAll] = useState(false)
  const isBacklog = place.id === BACKLOG_ID
  const folded = isBacklog ? !!p.backlogFold?.folded : place.status === 'DONE' && !open
  const shown = all ? place.cards : place.cards.slice(0, FOLD_AT)
  return (
    <section aria-label={place.label}>
      <div className="border-y border-border-subtle bg-surface-2 px-4 py-1.5">
        <ColumnHeader
          column={place} count={place.cards.length} note={place.note}
          onToggleStarts={!isBacklog && p.onToggleStarts ? () => p.onToggleStarts?.(place.id) : undefined}
          startsDisabledReason={p.startsDisabledReason}
          items={isBacklog ? (p.backlogFold ? [{ label: p.backlogFold.folded ? 'Show the Backlog' : 'Hide the Backlog', onSelect: p.backlogFold.toggle }] : []) : place.status === 'DONE' ? [{ label: open ? 'Hide done tasks' : 'Show done tasks', onSelect: onToggleOpen }] : []}
          showAlso={isBacklog ? p.showAlsoPicker : undefined}
        />
      </div>
      {!folded && (
        <>
          {place.cards.length === 0 && !isBacklog && <p className="px-4 py-2 text-small text-text-muted">Nothing here.</p>}
          <ul className="divide-y divide-border-subtle">
            {shown.map(card => (
              <li key={card.id}>
                <BoardCardView card={card} variant="row" now={p.now} onOpen={() => p.onOpen(card)} menu={p.menuFor(card, null)} linkRoutine={p.linkRoutine} linkAgent={p.linkAgent} />
              </li>
            ))}
          </ul>
          {place.cards.length > FOLD_AT && !all && (
            <button type="button" className="px-4 py-1.5 text-small text-accent hover:underline" onClick={() => setAll(true)}>
              {place.cards.length - FOLD_AT} more
            </button>
          )}
          {isBacklog && <ShowAlsoGroups p={p} />}
        </>
      )}
    </section>
  )
}

/** Other boards' backlogs, each under its own board's heading. */
export function ShowAlsoGroups({ p, variant = 'row' }: { p: ColumnsViewProps; variant?: 'row' | 'card' }) {
  return (
    <>
      {p.showAlso.map(g => (
        <div key={g.boardId} role="group" aria-label={`From ${g.boardName}`}>
          <h5 className="flex items-center gap-2 px-4 pb-1 pt-3 text-micro font-medium uppercase tracking-wide text-text-muted">
            From {g.boardName}
            <span className="rounded-full bg-surface-2 px-1.5 text-text-secondary">{g.tasks.length}</span>
          </h5>
          {g.tasks.length === 0 && <p className="px-4 py-1 text-small text-text-muted">Its Backlog is empty.</p>}
          <ul className={variant === 'row' ? 'divide-y divide-border-subtle' : 'space-y-2 px-0'}>
            {g.tasks.map(card => (
              <li key={card.id}>
                <BoardCardView card={card} variant={variant} now={p.now} from={g.boardName} onOpen={() => p.onOpen(card)} menu={p.menuFor(card, g)} linkRoutine={p.linkRoutine} linkAgent={p.linkAgent} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/** Narrow: the columns one after another as groups, the Backlog first and Done folded. */
export function StackedColumns(p: ColumnsViewProps) {
  const [doneOpen, setDoneOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setDoneOpen(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next })
  return (
    <div>
      {placesOf(p).map(place => (
        <PlaceGroup key={place.id} place={place} p={p} open={doneOpen.has(place.id)} onToggleOpen={() => toggle(place.id)} />
      ))}
    </div>
  )
}
