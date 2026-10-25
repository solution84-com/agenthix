/** Shared mocks of the Knowledge tool's screens: the address, the data module, and what a list holds. */
import { vi } from 'vitest'
import type { KnowledgePageRow, KnowledgePagesList } from '../knowledgeTypes'

export const address = { params: new URLSearchParams(), listeners: new Set<() => void>() }

export function setAddress(query: string) {
  address.params = new URLSearchParams(query)
  address.listeners.forEach(l => l())
}

export const data = {
  useKnowledgePages: vi.fn(),
  useKnowledgePageContent: vi.fn(),
  useKnowledgeSearch: vi.fn((..._a: unknown[]): { data: unknown[] | undefined; isLoading: boolean; error: Error | null } => ({ data: undefined, isLoading: false, error: null })),
  readKnowledgePage: vi.fn(),
  saveKnowledge: vi.fn(),
  moveKnowledge: vi.fn(),
  deleteKnowledge: vi.fn(),
}

export const ok = <T,>(value: T) => ({ data: value, isLoading: false, error: null as Error | null, refetch: vi.fn() })

export const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

export const row = (page: string, over: Partial<KnowledgePageRow> = {}): KnowledgePageRow => ({
  page, title: page.replace(/^.*\//, '').replace(/\.md$/, ''), description: '', tags: [], properties: {}, size: 100,
  modifiedAt: iso(3), version: `v-${page}`, problems: [], ...over,
})

export const listOf = (pages: KnowledgePageRow[], over: Partial<KnowledgePagesList> = {}): KnowledgePagesList => {
  const counts = new Map<string, number>()
  for (const p of pages) {
    const dir = p.page.includes('/') ? p.page.slice(0, p.page.lastIndexOf('/')) : ''
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  return {
    sections: [...counts.entries()].filter(([d]) => d !== '').map(([path, pageCount]) => ({ path, pageCount })),
    pages, canChange: true, ...over,
  }
}

/** Makes the tool "wide": the element reports a width past the breakpoint as soon as it is observed. */
export function stubWidth(width: number) {
  class Fake {
    constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
    observe() { this.cb([{ contentRect: { width } }]) }
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Fake)
}

/** The history screens' data module, replaced as a whole. */
export const history = {
  useVersionRows: vi.fn(() => ({ data: [], isLoading: false, error: null as Error | null })),
  useVersionText: vi.fn(() => ({ data: '', isLoading: false, error: null as Error | null })),
  useDeletedPages: vi.fn(() => ({ data: [], isLoading: false, error: null as Error | null })),
  useHistoryActions: vi.fn(() => ({ restore: vi.fn(), deleteForGood: vi.fn() })),
}
