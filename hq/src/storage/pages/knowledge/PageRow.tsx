import { changedLabel } from '@agenthix/ui/projects'
import { authorWords } from './ChangeLine'
import { pageLabel } from './browse'
import type { KnowledgePageRow } from './knowledgeTypes'
import { FOCUS_RING_INSET, ROW_ITEM } from '@agenthix/ui/primitives'

const valueText = (v: string | string[]) => (Array.isArray(v) ? v.join(', ') : v)

/**
 * One page as an item (U2): title, description, tags, the team's properties, when and who. A page with problems shows
 * them in place of its description, titled from its file name until it has a title.
 */
export function PageRow({ row, onOpen }: { row: KnowledgePageRow; onOpen: () => void }) {
  const properties = Object.entries(row.properties).filter(([, v]) => valueText(v) !== '')
  return (
    <button type="button" onClick={onOpen} className={`block w-full border-b border-border-subtle px-4 py-2.5 text-left ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-body font-medium text-text-primary">{pageLabel(row)}</span>
        <span className="shrink-0 text-small text-text-muted">
          {changedLabel(row.lastChange?.at ?? row.modifiedAt)}{row.lastChange ? ` · ${authorWords(row.lastChange.by)}` : ''}
        </span>
      </span>
      {row.problems.length > 0 ? (
        <span className="mt-0.5 block text-small text-warning">{row.problems.map(p => p.message).join(' · ')}</span>
      ) : (
        row.description && <span className="mt-0.5 block text-small text-text-secondary">{row.description}</span>
      )}
      {(properties.length > 0 || row.tags.length > 0) && (
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {properties.map(([name, value]) => (
            <span key={name} className="rounded-full border border-border-subtle px-2 py-0.5 text-micro text-text-secondary">
              <span className="text-text-muted">{name}</span> {valueText(value)}
            </span>
          ))}
          {row.tags.map(t => <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">{t}</span>)}
        </span>
      )}
    </button>
  )
}
