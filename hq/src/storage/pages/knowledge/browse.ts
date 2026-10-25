/** Browsing a place's knowledge, as pure functions over what the list gave: the section tree, what a view shows, the filters. */
import { sectionOfPage, titleFromPageName } from '@agenthix/core'
import type { KnowledgePageRow, KnowledgeSection } from './knowledgeTypes'

export interface SectionNode {
  path: string
  /** The last part of the path. */
  name: string
  /** Pages directly in it. */
  pageCount: number
  children: SectionNode[]
}

export interface SectionTree {
  sections: SectionNode[]
  /** Pages at the level's top, shown in the tree beside the sections. */
  topPages: KnowledgePageRow[]
}

/** Sections as the team laid them out; a folder only holding other folders is still there, with no pages of its own. */
export function sectionTree(sections: KnowledgeSection[], pages: KnowledgePageRow[]): SectionTree {
  const nodes = new Map<string, SectionNode>()
  const ensure = (path: string): SectionNode => {
    let node = nodes.get(path)
    if (!node) {
      node = { path, name: path.slice(path.lastIndexOf('/') + 1), pageCount: 0, children: [] }
      nodes.set(path, node)
      const parent = path.includes('/') ? ensure(path.slice(0, path.lastIndexOf('/'))) : null
      if (parent) parent.children.push(node)
    }
    return node
  }
  for (const s of sections) if (s.path !== '') ensure(s.path).pageCount = s.pageCount
  const roots = [...nodes.values()].filter(n => !n.path.includes('/'))
  const byName = (a: SectionNode, b: SectionNode) => a.name.localeCompare(b.name)
  for (const n of nodes.values()) n.children.sort(byName)
  return { sections: roots.sort(byName), topPages: pages.filter(p => sectionOfPage(p.page) === '') }
}

export type BrowseView = 'section' | 'all' | 'fix'

export interface BrowseFilters {
  query: string
  tag: string
  /** Property name → the value chosen; an absent name is not filtered. */
  properties: Record<string, string>
}

export const NO_FILTERS: BrowseFilters = { query: '', tag: '', properties: {} }

export const hasProblems = (p: KnowledgePageRow) => p.problems.length > 0

const asList = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v])

/** The pages a view shows, before the filters: a section's own, every page, or those with something wrong. */
export function pagesOfView(pages: KnowledgePageRow[], view: BrowseView, section: string): KnowledgePageRow[] {
  if (view === 'fix') return pages.filter(hasProblems)
  if (view === 'all') return pages
  return pages.filter(p => sectionOfPage(p.page) === section)
}

export function applyFilters(pages: KnowledgePageRow[], by: BrowseFilters): KnowledgePageRow[] {
  const q = by.query.trim().toLowerCase()
  return pages.filter(p => {
    if (q) {
      const text = [p.title, p.description, p.page, ...p.tags, ...Object.values(p.properties).flatMap(asList)].join(' ').toLowerCase()
      if (!text.includes(q)) return false
    }
    if (by.tag && !p.tags.includes(by.tag)) return false
    return Object.entries(by.properties).every(([name, value]) => !value || asList(p.properties[name] ?? []).includes(value))
  })
}

export function newestFirst(pages: KnowledgePageRow[]): KnowledgePageRow[] {
  return [...pages].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export function tagsOfPages(pages: KnowledgePageRow[]): string[] {
  return [...new Set(pages.flatMap(p => p.tags))].sort()
}

/** Each property the pages use, with the values they hold: one filter apiece. */
export function propertiesOfPages(pages: KnowledgePageRow[]): { name: string; values: string[] }[] {
  const seen = new Map<string, Set<string>>()
  for (const p of pages) {
    for (const [name, value] of Object.entries(p.properties)) {
      const values = seen.get(name) ?? new Set<string>()
      asList(value).filter(v => v !== '').forEach(v => values.add(v))
      seen.set(name, values)
    }
  }
  return [...seen.entries()].filter(([, v]) => v.size > 0).map(([name, v]) => ({ name, values: [...v].sort() })).sort((a, b) => a.name.localeCompare(b.name))
}

/** A page's name for a person: its title, or its file name while it has none. */
export const pageLabel = (p: Pick<KnowledgePageRow, 'page' | 'title'>) => p.title || titleFromPageName(p.page)

export const pageFileName = (page: string) => page.slice(page.lastIndexOf('/') + 1)
