import type { LibraryItem } from '../packages/packageActions'

export type LibraryKind = 'agents' | 'boards' | 'skills' | 'teams'
export const KINDS: Array<{ id: LibraryKind; label: string; one: string }> = [
  { id: 'agents', label: 'Agents', one: 'agent' },
  { id: 'boards', label: 'Boards', one: 'board' },
  { id: 'skills', label: 'Skills', one: 'skill' },
  { id: 'teams', label: 'Teams', one: 'team' },
]
export type LibraryTab = LibraryKind | 'marketplace'
export const isLibraryTab = (value: string | null): value is LibraryTab => value === 'marketplace' || KINDS.some(k => k.id === value)

export type SourceFilter = '' | LibraryItem['source']
export const SOURCE_LABEL: Record<LibraryItem['source'], string> = { BUILT_IN: 'Built in', MADE_HERE: 'Made here', MARKETPLACE: 'Marketplace' }

/** "Built in", "Made here", "Marketplace · v2.1": where an item came from. */
export function sourceText(item: Pick<LibraryItem, 'source' | 'version'>): string {
  return item.source === 'MARKETPLACE' ? `Marketplace · v${item.version}` : SOURCE_LABEL[item.source]
}

/** "by Northwind Labs": who made it, for what did not ship with hq. */
export function publisherText(item: Pick<LibraryItem, 'source' | 'publisher'>): string | null {
  return item.source !== 'BUILT_IN' && item.publisher ? `by ${item.publisher}` : null
}

export const USE_LABEL: Record<LibraryKind, string> = { agents: 'Add to agents', boards: 'Use', skills: 'Use', teams: 'Use' }
