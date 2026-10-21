import { useState } from 'react'
import { useNavigate } from 'react-router'
import { SearchField, FilterSelect } from '@agenthix/ui/primitives'
import type { LibraryItem } from '../packages/packageActions'
import type { PackageKind } from '../packages/packageManifest'
import type { MenuItem } from '../../org/components/menus'
import { LibraryRow } from './LibraryRow'
import { KINDS, SOURCE_LABEL, USE_LABEL, type LibraryKind, type SourceFilter } from './libraryWords'

/** One kind's items (every screen reviewed spec §3, Library): search, a source filter, and a row for each. */
export function LibraryKindList({ kind, items, isAdmin, onAddAgent, onViewBoard, onViewSkill, onExport }: {
  kind: LibraryKind
  items: LibraryItem[]
  isAdmin: boolean
  onAddAgent: (id: string) => void
  onViewBoard: (id: string) => void
  onViewSkill: (item: LibraryItem) => void
  onExport: (kind: PackageKind, id: string) => void
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<SourceFilter>('')
  const info = KINDS.find(k => k.id === kind)!
  const shown = items.filter(i =>
    (!source || i.source === source) && `${i.name} ${i.description} ${i.publisher ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))

  const use = (item: LibraryItem) => {
    if (kind === 'agents') onAddAgent(item.id)
    else if (kind === 'boards') onViewBoard(item.id)
    else if (kind === 'skills') onViewSkill(item)
    else navigate(`/workforce-templates/review?templateId=${item.id}`)
  }
  const menu = (item: LibraryItem): MenuItem[] => [
    { label: 'Export', hint: 'Save it as a package', disabled: !isAdmin, onSelect: () => onExport(item.kind, item.id) },
  ]

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SearchField label={`Search ${info.label.toLowerCase()}`} value={search} onChange={setSearch} className="w-60" />
        <FilterSelect label="Source" value={source} onChange={v => setSource(v as SourceFilter)}>
          <option value="">Built in · Made here · Marketplace</option>
          {(Object.keys(SOURCE_LABEL) as Array<keyof typeof SOURCE_LABEL>).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </FilterSelect>
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-body text-text-muted">{items.length === 0 ? `No ${info.label.toLowerCase()} in the library yet.` : 'Nothing matches.'}</p>
      ) : (
        shown.map(item => <LibraryRow key={item.id} item={item} useLabel={USE_LABEL[kind]} onUse={() => use(item)} menu={menu(item)} />)
      )}
    </div>
  )
}
