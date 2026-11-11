import { useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { pageLabel, type SectionNode, type SectionTree as Tree } from './browse'
import type { KnowledgePageRow } from './knowledgeTypes'
import { ROW_CHOSEN, ROW_ITEM, DISABLED, FOCUS_RING, FOCUS_RING_INSET } from '@agenthix/ui/primitives'

const ITEM = 'flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-small'

export type Selection = { view: 'section'; section: string } | { view: 'all' } | { view: 'fix' } | { view: 'deleted' }

/** The entries under the sections: every page, those needing a fix, and the deleted ones that can still be restored. */
export function ViewEntries({ selected, total, fixing, onSelect }: {
  selected: Selection | null
  total: number
  fixing: number
  onSelect: (s: Selection) => void
}) {
  const row = (view: Selection['view'], label: string, count?: number) => (
    <button
      type="button"
      onClick={() => onSelect({ view } as Selection)}
      aria-current={selected?.view === view ? 'true' : undefined}
      className={`${ITEM} ${selected?.view === view ? ROW_CHOSEN : ROW_ITEM}`}
    >
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-micro text-text-muted">{count}</span>}
    </button>
  )
  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      {row('all', 'All pages', total)}
      {row('fix', 'Needs fixing', fixing)}
      {row('deleted', 'Recently deleted')}
    </div>
  )
}

function Branch({ node, depth, selected, collapsed, toggle, onSelect }: {
  node: SectionNode
  depth: number
  selected: string | null
  collapsed: Set<string>
  toggle: (path: string) => void
  onSelect: (s: Selection) => void
}) {
  const closed = collapsed.has(node.path)
  const isSelected = selected === node.path
  return (
    <li>
      <div className="flex items-center" style={{ paddingLeft: `${depth * 12}px` }}>
        {node.children.length > 0 ? (
          <button
            type="button" aria-label={`${closed ? 'Open' : 'Close'} ${node.name}`} aria-expanded={!closed}
            onClick={() => toggle(node.path)} className={`rounded p-0.5 text-text-muted not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`}
          >
            {closed ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
          </button>
        ) : <span className="w-[17px]" aria-hidden />}
        <button
          type="button"
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelect({ view: 'section', section: node.path })}
          className={`${ITEM} ${isSelected ? ROW_CHOSEN : ROW_ITEM}`}
        >
          <Folder size={13} aria-hidden className="shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="text-micro text-text-muted">{node.pageCount}</span>
        </button>
      </div>
      {!closed && node.children.length > 0 && (
        <ul>
          {node.children.map(c => (
            <Branch key={c.path} node={c} depth={depth + 1} selected={selected} collapsed={collapsed} toggle={toggle} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The place's sections as a tree (wide), with its top-level pages beside them. */
export function SectionTreeView({ tree, selected, onSelect, onOpenPage }: {
  tree: Tree
  selected: Selection | null
  onSelect: (s: Selection) => void
  onOpenPage: (page: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (path: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  })
  return (
    <nav aria-label="Sections">
      <ul>
        {tree.sections.map(n => (
          <Branch
            key={n.path} node={n} depth={0} selected={selected?.view === 'section' ? selected.section : null}
            collapsed={collapsed} toggle={toggle} onSelect={onSelect}
          />
        ))}
        {tree.topPages.map(p => <TopPage key={p.page} page={p} onOpen={onOpenPage} />)}
      </ul>
    </nav>
  )
}

function TopPage({ page, onOpen }: { page: KnowledgePageRow; onOpen: (page: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(page.page)} className={`${ITEM} pl-[19px] text-text-secondary`}>
        <File size={13} aria-hidden className="shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate">{pageLabel(page)}</span>
      </button>
    </li>
  )
}

/** Phone: one level of the tree at a time, a section's sections as rows with their page counts. */
export function SectionLevel({ sections, onSelect }: { sections: SectionNode[]; onSelect: (s: Selection) => void }) {
  return (
    <ul>
      {sections.map(n => (
        <li key={n.path}>
          <button
            type="button" onClick={() => onSelect({ view: 'section', section: n.path })}
            className={`flex w-full items-center gap-2.5 border-b border-border-subtle px-4 py-2.5 text-left ${ROW_ITEM} ${FOCUS_RING_INSET}`}
          >
            <Folder size={15} aria-hidden className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-body text-text-primary">{n.name}</span>
            <span className="text-small text-text-muted">{n.pageCount} {n.pageCount === 1 ? 'page' : 'pages'}</span>
            <ChevronRight size={14} aria-hidden className="text-text-muted" />
          </button>
        </li>
      ))}
    </ul>
  )
}
