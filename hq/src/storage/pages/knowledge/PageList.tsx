import { useEffect, useState } from 'react'
import { SearchField, FilterSelect } from '@agenthix/ui/primitives'
import { FilesGroupHeading, FilesQuietLine } from '@agenthix/ui/projects'
import {
  applyFilters, newestFirst, propertiesOfPages, tagsOfPages, NO_FILTERS, type BrowseFilters,
} from './browse'
import { PageRow } from './PageRow'
import { useKnowledgeSearch } from './knowledgeData'
import type { KnowledgeOwner, KnowledgePageRow } from './knowledgeTypes'
import { SearchResults } from './search/SearchResults'
import { SearchScopeSwitch } from './search/SearchScopeSwitch'
import { DEFAULT_SCOPE, type SearchScope } from './search/searchScope'

/** What was typed, once it has rested a moment: the search over the pages' text runs on this. */
function useRested(value: string, ms = 300): string {
  const [rested, setRested] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setRested(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return rested
}

/** The search over the pages, in place of the list while there is text in the box: This project, Organisation or Both, each result marked by where it is from. */
function TextSearch({ owner, personal, query, onOpen }: { owner: KnowledgeOwner; personal: boolean; query: string; onOpen: (page: string) => void }) {
  const [scope, setScope] = useState<SearchScope>(DEFAULT_SCOPE)
  const found = useKnowledgeSearch(owner, useRested(query), scope)
  return (
    <section aria-label="Search results" data-testid="text-search">
      {owner.ownerType !== 'org' && (
        <div className="px-4 py-2"><SearchScopeSwitch value={scope} onChange={setScope} personal={personal} /></div>
      )}
      {found.error ? (
        <FilesQuietLine role="status">{found.error.message}</FilesQuietLine>
      ) : !found.data ? (
        <FilesQuietLine>Searching…</FilesQuietLine>
      ) : (
        <SearchResults hits={found.data} personal={personal} onOpen={onOpen} />
      )}
    </section>
  )
}

/** The filters of what is listed: search, Tag, and one for each property the listed pages use. */
function Filters({ pages, filters, onChange }: { pages: KnowledgePageRow[]; filters: BrowseFilters; onChange: (f: BrowseFilters) => void }) {
  const tags = tagsOfPages(pages)
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <SearchField label="Search knowledge" value={filters.query} onChange={query => onChange({ ...filters, query })} className="min-w-[10rem] flex-1" />
      <FilterSelect label="Tag" value={filters.tag} onChange={tag => onChange({ ...filters, tag })}>
        <option value="">Tag</option>
        {tags.map(t => <option key={t} value={t}>{t}</option>)}
      </FilterSelect>
      {propertiesOfPages(pages).map(({ name, values }) => (
        <FilterSelect
          key={name} label={name} value={filters.properties[name] ?? ''}
          onChange={value => onChange({ ...filters, properties: { ...filters.properties, [name]: value } })}
        >
          <option value="">{name}</option>
          {values.map(v => <option key={v} value={v}>{v}</option>)}
        </FilterSelect>
      ))}
    </div>
  )
}

/** The pages of the view being browsed, newest first, under their filters. */
export function PageList({ owner, personal = false, heading, pages, filters, onFilters, empty, onOpen }: {
  owner: KnowledgeOwner
  personal?: boolean
  heading: string
  pages: KnowledgePageRow[]
  filters: BrowseFilters
  onFilters: (f: BrowseFilters) => void
  /** What an empty view says when nothing is filtered out. */
  empty: string
  onOpen: (page: string) => void
}) {
  const shown = newestFirst(applyFilters(pages, filters))
  const filtered = filters.query !== '' || filters.tag !== '' || Object.values(filters.properties).some(v => v !== '')
  const searching = filters.query.trim() !== ''
  return (
    <div>
      <Filters pages={pages} filters={filters} onChange={onFilters} />
      {searching ? (
        <TextSearch owner={owner} personal={personal} query={filters.query} onOpen={onOpen} />
      ) : (
        <>
          <FilesGroupHeading count={shown.length}>{heading}</FilesGroupHeading>
          {shown.length === 0 ? (
            <FilesQuietLine>{filtered ? 'No pages match.' : empty}</FilesQuietLine>
          ) : (
            shown.map(row => <PageRow key={row.page} row={row} onOpen={() => onOpen(row.page)} />)
          )}
        </>
      )}
    </div>
  )
}

export { NO_FILTERS }
