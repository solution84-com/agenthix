import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { OverflowMenu } from '@agenthix/ui/tasks'
import { FILES_BUTTON_PRIMARY, FilesGroupHeading } from '@agenthix/ui/projects'
import { NO_FILTERS, hasProblems, pageFileName, pagesOfView, sectionTree, type BrowseFilters, type SectionNode } from './browse'
import { NewSection } from './NewSection'
import { PageList } from './PageList'
import { PageRow } from './PageRow'
import { SectionLevel, SectionTreeView, ViewEntries, type Selection } from './SectionTree'
import type { KnowledgeOwner, KnowledgePagesList } from './knowledgeTypes'

const find = (nodes: SectionNode[], path: string): SectionNode | null => {
  for (const n of nodes) {
    if (n.path === path) return n
    const inner = find(n.children, path)
    if (inner) return inner
  }
  return null
}

/**
 * Browsing (U2): the sections as a tree beside the selected section's pages, or on a phone one level at a time.
 * `selected` null on a phone is the top level of the tree.
 */
export function KnowledgeBrowse({ owner, personal, list, wide, selected, onSelect, onOpenPage, onNewPage, deleted }: {
  owner: KnowledgeOwner
  personal?: boolean
  list: KnowledgePagesList
  wide: boolean
  selected: Selection | null
  onSelect: (s: Selection | null) => void
  onOpenPage: (page: string) => void
  onNewPage: (section: string) => void
  /** Recently deleted, drawn by its own part of the tool. */
  deleted: () => ReactNode
}) {
  const [filters, setFilters] = useState<BrowseFilters>(NO_FILTERS)
  const [naming, setNaming] = useState(false)
  const tree = useMemo(() => sectionTree(list.sections, list.pages), [list])
  const fixing = list.pages.filter(hasProblems).length
  const select = (s: Selection) => { setFilters(NO_FILTERS); setNaming(false); onSelect(s) }

  const view = selected ?? (wide ? ({ view: 'all' } as Selection) : null)
  const section = view?.view === 'section' ? view.section : ''
  const node = section === '' ? null : find(tree.sections, section)
  const entries = <ViewEntries selected={view} total={list.pages.length} fixing={fixing} onSelect={select} />

  const heading = view?.view === 'fix' ? 'Needs fixing' : view?.view === 'all' ? 'All pages' : section ? section.slice(section.lastIndexOf('/') + 1) : 'Pages'
  const listed = view && view.view !== 'deleted' ? pagesOfView(list.pages, view.view, section) : []
  const empty = view?.view === 'fix' ? 'Nothing needs fixing.' : list.pages.length === 0 ? 'Nothing is known here yet. Agents add pages as they learn.' : 'No pages here yet.'

  const toolbar = (
    <div className="flex items-center gap-2 px-4 pt-3">
      <h3 className="min-w-0 flex-1 truncate text-h3 font-semibold text-text-primary">{view?.view === 'deleted' ? 'Recently deleted' : heading}</h3>
      {list.canChange && view?.view !== 'deleted' && (
        <>
          <button type="button" className={FILES_BUTTON_PRIMARY} onClick={() => onNewPage(section)}>New page</button>
          <OverflowMenu items={[{ label: 'New section', onSelect: () => setNaming(true) }]} />
        </>
      )}
    </div>
  )
  const body = view?.view === 'deleted' ? deleted() : (
    <>
      {naming && <NewSection parent={section} onCreate={onNewPage} onCancel={() => setNaming(false)} />}
      <PageList owner={owner} personal={personal} heading={heading} pages={listed} filters={filters} onFilters={setFilters} empty={empty} onOpen={onOpenPage} />
    </>
  )

  if (wide) {
    return (
      <div className="flex">
        <aside className="w-56 shrink-0 border-r border-border-subtle px-2 py-3">
          <h4 className="px-2 pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Sections</h4>
          <SectionTreeView tree={tree} selected={view} onSelect={select} onOpenPage={onOpenPage} />
          {entries}
        </aside>
        <div className="min-w-0 flex-1">{toolbar}{body}</div>
      </div>
    )
  }

  // A phone: sections, then a section's pages; never both trees at once.
  if (!view) {
    return (
      <div>
        {list.canChange && <div className="flex justify-end px-4 pt-3"><button type="button" className={FILES_BUTTON_PRIMARY} onClick={() => onNewPage('')}>New page</button></div>}
        <SectionLevel sections={tree.sections} onSelect={select} />
        {tree.topPages.map(p => <PageRow key={p.page} row={{ ...p, title: p.title || pageFileName(p.page) }} onOpen={() => onOpenPage(p.page)} />)}
        <div className="px-2 pb-3">{entries}</div>
      </div>
    )
  }
  const parent = section.includes('/') ? section.slice(0, section.lastIndexOf('/')) : null
  return (
    <div>
      <button
        type="button" onClick={() => onSelect(parent === null ? null : { view: 'section', section: parent })}
        className="flex items-center gap-1 px-4 pt-3 text-small text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft size={14} aria-hidden /> {parent ? parent.slice(parent.lastIndexOf('/') + 1) : 'Knowledge'}
      </button>
      {toolbar}
      {view.view === 'section' && node && node.children.length > 0 && (
        <>
          <FilesGroupHeading>Sections</FilesGroupHeading>
          <SectionLevel sections={node.children} onSelect={select} />
        </>
      )}
      {body}
    </div>
  )
}
