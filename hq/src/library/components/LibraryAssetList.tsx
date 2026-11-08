import { useRef } from 'react'
import { SearchField } from '@agenthix/ui/primitives'
import type { LibraryAssetRow as Row, LibraryKindId } from '../assetList/types'
import { LibraryAssetCard } from './LibraryAssetCard'
import { CARD_GAP, CARD_MIN, useGridColumns } from './useGridColumns'
import { TYPE_CHIPS, chipCounts, filterRows, type LibraryFilter, type TypeFilter } from './libraryFilters'

function Chip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className={`rounded-full border px-3 py-1 text-small transition-colors ${on ? 'border-accent bg-accent-subtle text-accent' : 'border-border text-text-secondary hover:bg-surface-hover'}`}
    >
      {label} <span className="text-text-muted">{count}</span>
    </button>
  )
}

/** Under All, one shelf per kind (Agents and teams share one), in this order. */
const SHELVES: Array<{ title: string; kinds: LibraryKindId[] }> = [
  { title: 'Skills', kinds: ['skill'] },
  { title: 'Agents and teams', kinds: ['agent', 'team'] },
  { title: 'Task templates', kinds: ['task-template'] },
]
const KIND_WORDS: Record<LibraryKindId, string> = { skill: 'skills', agent: 'agents', team: 'teams', board: 'boards', 'task-template': 'task templates' }

/** As many columns as fit at about 280 px each; one on a phone. */
const GRID_STYLE = { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${CARD_MIN}px), 1fr))`, gap: CARD_GAP }

type CardActions = { isAdmin: boolean; onCreateAgent: (assetId: string) => void; onExport: (row: Row) => void; onRemove: (row: Row) => void }

function Cards({ rows, actions, limit }: { rows: Row[]; actions: CardActions; limit?: number }) {
  return <>{(limit === undefined ? rows : rows.slice(0, limit)).map(r => <LibraryAssetCard key={r.key} row={r} {...actions} />)}</>
}

function Shelf({ title, kinds, rows, columns, actions, onSeeAll }: {
  title: string; kinds: LibraryKindId[]; rows: Row[]; columns: number; actions: CardActions; onSeeAll: (kind: LibraryKindId) => void
}) {
  const link = 'text-small font-medium text-accent hover:underline'
  return (
    <section aria-label={title} data-testid="library-shelf" className="mt-6 first:mt-0">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-body font-semibold text-text-primary">{title}</h2>
        <span className="text-small text-text-muted">{rows.length}</span>
        <span className="ml-auto flex gap-3">
          {kinds.map(k => (
            <button key={k} type="button" className={link} onClick={() => onSeeAll(k)}>
              {kinds.length === 1 ? 'See all' : `See all ${KIND_WORDS[k]}`}
            </button>
          ))}
        </span>
      </div>
      <div className="grid" style={GRID_STYLE}><Cards rows={rows} actions={actions} limit={columns} /></div>
    </section>
  )
}

/**
 * The one searched view of every asset (board *The Library*): search, the type chips with Needs you among them (shown
 * only to someone who can act, and only when something needs them), then cards: a shelf for each kind under All, or one grid of what a kind's chip, Needs you or a search leaves.
 */
export function LibraryAssetList({ rows, filter, onFilter, isAdmin, canAct, onCreateAgent, onExport, onRemove }: {
  rows: Row[]
  filter: LibraryFilter
  onFilter: (next: LibraryFilter) => void
  isAdmin: boolean
  /** May add or make: Needs you is for those who can do something about it. */
  canAct: boolean
  onCreateAgent: (assetId: string) => void
  onExport: (row: Row) => void
  onRemove: (row: Row) => void
}) {
  const shown = filterRows(rows, filter)
  const counts = chipCounts(rows, filter)
  const chooseType = (type: TypeFilter) => onFilter({ ...filter, type })
  const grid = useRef<HTMLDivElement>(null)
  const columns = useGridColumns(grid)
  const actions: CardActions = { isAdmin, onCreateAgent, onExport, onRemove }
  const shelves = filter.type === 'all' && !filter.needsYou && filter.search.trim() === ''
  const showNeeds = canAct && (counts.needsYou > 0 || filter.needsYou)
  return (
    <div>
      <SearchField label="Search the Library: skills, agents, boards, teams" value={filter.search} onChange={search => onFilter({ ...filter, search })} className="w-full max-w-md" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Type" className="flex flex-wrap items-center gap-2">
          <Chip label="All" count={counts.types.all} on={filter.type === 'all'} onClick={() => chooseType('all')} />
          {TYPE_CHIPS.map(t => <Chip key={t.id} label={t.label} count={counts.types[t.id]} on={filter.type === t.id} onClick={() => chooseType(t.id)} />)}
        </div>
        {showNeeds && <Chip label="Needs you" count={counts.needsYou} on={filter.needsYou} onClick={() => onFilter({ ...filter, needsYou: !filter.needsYou })} />}
      </div>
      <div className="mt-4" data-testid="library-rows">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-body text-text-muted">{rows.length === 0 ? 'Nothing is installed yet. Use Add to bring something in.' : 'Nothing matches.'}</p>
        ) : shelves ? (
          SHELVES.map(sh => {
            const inShelf = sh.kinds.flatMap(k => shown.filter(r => r.kind === k))
            return inShelf.length === 0 ? null : <Shelf key={sh.title} {...sh} rows={inShelf} columns={columns} actions={actions} onSeeAll={chooseType} />
          })
        ) : (
          <div className="grid" style={GRID_STYLE} data-testid="library-grid"><Cards rows={shown} actions={actions} /></div>
        )}
        <div ref={grid} aria-hidden className="h-0 w-full" />
      </div>
    </div>
  )
}
