import { SearchField } from '@agenthix/ui/primitives'
import type { LibraryAssetRow as Row, LibraryStatus } from '../assetList/types'
import { LibraryAssetRow } from './LibraryAssetRow'
import { STATUS_CHIPS, TYPE_CHIPS, chipCounts, filterRows, type LibraryFilter, type TypeFilter } from './libraryFilters'

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

/** The one searched view of every asset (board U2): search, Type chips, Show chips, then a row for each. */
export function LibraryAssetList({ rows, filter, onFilter, isAdmin, onCreateAgent, onExport, onRemove }: {
  rows: Row[]
  filter: LibraryFilter
  onFilter: (next: LibraryFilter) => void
  isAdmin: boolean
  onCreateAgent: (assetId: string) => void
  onExport: (row: Row) => void
  onRemove: (row: Row) => void
}) {
  const shown = filterRows(rows, filter)
  const counts = chipCounts(rows, filter)
  const chooseType = (type: TypeFilter) => onFilter({ ...filter, type })
  const chooseStatus = (id: LibraryStatus) => onFilter({ ...filter, status: filter.status === id ? null : id })
  return (
    <div>
      <SearchField label="Search the Library: skills, agents, boards, teams" value={filter.search} onChange={search => onFilter({ ...filter, search })} className="w-full max-w-md" />
      <div role="group" aria-label="Type" className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-small text-text-muted">Type</span>
        <Chip label="All" count={counts.types.all} on={filter.type === 'all'} onClick={() => chooseType('all')} />
        {TYPE_CHIPS.map(t => <Chip key={t.id} label={t.label} count={counts.types[t.id]} on={filter.type === t.id} onClick={() => chooseType(t.id)} />)}
      </div>
      <div role="group" aria-label="Show" className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-small text-text-muted">Show</span>
        {STATUS_CHIPS.map(s => <Chip key={s.id} label={s.label} count={counts.statuses[s.id]} on={filter.status === s.id} onClick={() => chooseStatus(s.id)} />)}
      </div>
      <div className="mt-4" data-testid="library-rows">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-body text-text-muted">{rows.length === 0 ? 'Nothing is installed yet. Use Add to bring something in.' : 'Nothing matches.'}</p>
        ) : (
          shown.map(r => <LibraryAssetRow key={r.key} row={r} isAdmin={isAdmin} onCreateAgent={onCreateAgent} onExport={onExport} onRemove={onRemove} />)
        )}
      </div>
    </div>
  )
}
