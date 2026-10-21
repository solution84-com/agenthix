import type { LibraryItem } from '../packages/packageActions'
import { MoreMenu, type MenuItem } from '../../org/components/menus'
import { publisherText, sourceText } from './libraryWords'

/** One item of the Library (every screen reviewed spec §3): its name, what it is, where it came from, its action and ⋯. */
export function LibraryRow({ item, useLabel, onUse, menu }: { item: LibraryItem; useLabel: string; onUse: () => void; menu: MenuItem[] }) {
  const publisher = publisherText(item)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle py-3 first:border-t-0" data-testid="library-row">
      <div className="min-w-0 flex-1 basis-48">
        <div className="truncate text-body font-medium text-text-primary">{item.name}</div>
        {(item.description || publisher) && (
          <div className="truncate text-small text-text-muted">{[item.description, publisher].filter(Boolean).join(' · ')}</div>
        )}
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium ${item.source === 'MADE_HERE' ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-text-secondary'}`}>
        {sourceText(item)}
      </span>
      <button type="button" onClick={onUse} className="shrink-0 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover">{useLabel}</button>
      <MoreMenu items={menu} label={`More about ${item.name}`} />
    </div>
  )
}
