import { needsYou } from '../assetList/words'
import type { LibraryAssetRow, LibraryKindId } from '../assetList/types'

export type TypeFilter = 'all' | LibraryKindId

export const TYPE_CHIPS: Array<{ id: LibraryKindId; label: string }> = [
  { id: 'skill', label: 'Skills' },
  { id: 'agent', label: 'Agents' },
  { id: 'board', label: 'Boards' },
  { id: 'team', label: 'Teams' },
]

/** The one state filter, as the address writes it (`?show=needs-you`). */
export const NEEDS_YOU_PARAM = 'needs-you'

export const isTypeFilter = (v: string | null): v is TypeFilter => v === 'all' || TYPE_CHIPS.some(t => t.id === v)

export type LibraryFilter = { search: string; type: TypeFilter; needsYou: boolean }

const haystack = (r: LibraryAssetRow) =>
  [r.title, r.description, r.identity, r.signer, r.has, r.kind, r.proposedBy ?? '', ...r.partners.flatMap(p => [p.identity, p.words])].join(' ').toLowerCase()

export function filterRows(rows: LibraryAssetRow[], f: LibraryFilter): LibraryAssetRow[] {
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter(r =>
    (f.type === 'all' || r.kind === f.type)
    && (!f.needsYou || needsYou(r))
    && words.every(w => haystack(r).includes(w)))
}

/** Each chip's count: types over the rows Needs you and the search leave, Needs you over the rows the type and search leave. */
export function chipCounts(rows: LibraryAssetRow[], f: LibraryFilter) {
  const byType = filterRows(rows, { ...f, type: 'all' })
  const byNeeds = filterRows(rows, { ...f, needsYou: false })
  return {
    types: { all: byType.length, ...Object.fromEntries(TYPE_CHIPS.map(t => [t.id, byType.filter(r => r.kind === t.id).length])) } as Record<TypeFilter, number>,
    needsYou: byNeeds.filter(needsYou).length,
  }
}
