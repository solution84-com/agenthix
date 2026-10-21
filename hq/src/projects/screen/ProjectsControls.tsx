import type { ReactNode } from 'react'
import { SearchField } from '@agenthix/ui/primitives'
import { VIEWS, VIEW_LABEL, useProjectsScreenUrl } from './projectsScreenUrl'

/**
 * The row under the Projects screen's header (every screen reviewed spec §3): the three views, the search, and the
 * filters of the view shown. The same segmented control is a row of chips on a phone.
 */
export function ProjectsControls({ search, onSearch, searchLabel, children }: {
  search: string
  onSearch: (value: string) => void
  searchLabel: string
  children?: ReactNode
}) {
  const { screen, toView } = useProjectsScreenUrl()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Views" className="flex w-full gap-1.5 md:inline-flex md:w-auto md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-border">
        {VIEWS.map(v => {
          const on = v === screen.view
          return (
            <button
              key={v} type="button" aria-current={on ? 'page' : undefined} onClick={() => !on && toView(v)}
              className={`rounded-full border px-3 py-1 text-small transition-colors md:rounded-none md:border-0 md:px-3.5 md:py-1.5 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-border ${
                on ? 'border-accent bg-accent/10 font-medium text-text-primary' : 'border-border-subtle bg-surface-1 text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {VIEW_LABEL[v]}
            </button>
          )
        })}
      </nav>
      <SearchField label={searchLabel} value={search} onChange={onSearch} className="min-w-[140px] flex-1 lg:max-w-[240px] lg:flex-none" />
      {children}
    </div>
  )
}
