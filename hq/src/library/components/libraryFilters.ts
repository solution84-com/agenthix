import type { LibraryAssetRow, LibraryKindId, LibraryStatus } from '../assetList/types'

export type TypeFilter = 'all' | LibraryKindId

export const TYPE_CHIPS: Array<{ id: LibraryKindId; label: string }> = [
  { id: 'skill', label: 'Skills' },
  { id: 'agent', label: 'Agents' },
  { id: 'board', label: 'Boards' },
  { id: 'team', label: 'Teams' },
]

export const STATUS_CHIPS: Array<{ id: LibraryStatus; label: string }> = [
  { id: 'waiting', label: 'Waiting for review' },
  { id: 'update', label: 'Update available' },
  { id: 'draft', label: 'Draft' },
  { id: 'noAgent', label: 'No agent yet' },
  { id: 'setAside', label: 'Set aside' },
  { id: 'unsigned', label: 'Unsigned' },
]

export const isTypeFilter = (v: string | null): v is TypeFilter => v === 'all' || TYPE_CHIPS.some(t => t.id === v)
export const isStatusFilter = (v: string | null): v is LibraryStatus => STATUS_CHIPS.some(s => s.id === v)

export type LibraryFilter = { search: string; type: TypeFilter; status: LibraryStatus | null }

const haystack = (r: LibraryAssetRow) =>
  [r.title, r.description, r.identity, r.signer, r.has, r.kind, r.proposedBy ?? ''].join(' ').toLowerCase()

export function filterRows(rows: LibraryAssetRow[], f: LibraryFilter): LibraryAssetRow[] {
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter(r =>
    (f.type === 'all' || r.kind === f.type)
    && (f.status === null || r.statuses.includes(f.status))
    && words.every(w => haystack(r).includes(w)))
}

/** Each chip's count: types over the rows the status and search leave, statuses over the rows the type and search leave. */
export function chipCounts(rows: LibraryAssetRow[], f: LibraryFilter) {
  const byType = filterRows(rows, { ...f, type: 'all' })
  const byStatus = filterRows(rows, { ...f, status: null })
  return {
    types: { all: byType.length, ...Object.fromEntries(TYPE_CHIPS.map(t => [t.id, byType.filter(r => r.kind === t.id).length])) } as Record<TypeFilter, number>,
    statuses: Object.fromEntries(STATUS_CHIPS.map(s => [s.id, byStatus.filter(r => r.statuses.includes(s.id)).length])) as Record<LibraryStatus, number>,
  }
}
