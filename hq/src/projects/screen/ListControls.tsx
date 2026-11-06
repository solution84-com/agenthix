import type { ReactNode } from 'react'
import { SearchField } from '@agenthix/ui/primitives'

/** The row under a list page's header: its search, then the filters of the list shown. */
export function ListControls({ search, onSearch, searchLabel, children }: {
  search: string
  onSearch: (value: string) => void
  searchLabel: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchField label={searchLabel} value={search} onChange={onSearch} className="min-w-[140px] flex-1 lg:max-w-[240px] lg:flex-none" />
      {children}
    </div>
  )
}
