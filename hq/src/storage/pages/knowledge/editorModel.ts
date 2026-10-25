/** The editor's page as fields, and back to the page's text. A person never writes front matter. */
import {
  checkPageChange, checkPageDescription, checkPageName, checkPageProperties, checkPageTags, checkPageTitle,
  parseFrontMatter, renderFrontMatter, sectionOfPage, sectionNameProblem,
  type KnowledgePageProblem,
} from '@agenthix/core'
import type { KnowledgePageRow } from './knowledgeTypes'

export interface PropertyRow {
  name: string
  /** Shown as typed; a list is "a, b". */
  value: string
  /** The property was a list on the page, so it is written back as one. */
  list: boolean
}

export interface EditorState {
  title: string
  description: string
  tags: string[]
  properties: PropertyRow[]
  body: string
  /** A new page: the section it goes in. */
  section: string
}

export const EMPTY_EDITOR: EditorState = { title: '', description: '', tags: [], properties: [], body: '', section: '' }

/** The fields of a page's text; a page whose front matter cannot be read starts with its text and empty fields. */
export function editorFromContent(page: string, content: string): EditorState {
  const front = parseFrontMatter(content)
  const unreadable = front.problems.length > 0
  const { summary } = checkPageChange(page, content)
  return {
    title: unreadable ? '' : summary.title,
    description: summary.description,
    tags: summary.tags,
    properties: Object.entries(summary.properties).map(([name, v]) => ({ name, value: Array.isArray(v) ? v.join(', ') : v, list: Array.isArray(v) })),
    body: unreadable && front.body === '' ? content : front.body,
    section: sectionOfPage(page),
  }
}

const splitList = (value: string) => value.split(',').map(v => v.trim()).filter(v => v !== '')

/** Properties with a name and a value; a row left empty is not written. */
export function propertiesOf(rows: PropertyRow[]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (name === '' || row.value.trim() === '') continue
    out[name] = row.list ? splitList(row.value) : row.value.trim()
  }
  return out
}

export function contentOf(state: EditorState): string {
  const body = state.body.replace(/^\n+/, '')
  return renderFrontMatter({
    title: state.title.trim(), description: state.description.trim(), tags: state.tags, properties: propertiesOf(state.properties),
  }) + (body === '' ? '' : `${body}${body.endsWith('\n') ? '' : '\n'}`)
}

/** A page's file name from its title: lower-case words joined by hyphens. */
export function fileNameFromTitle(title: string): string {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  return slug === '' ? '' : `${slug}.md`
}

export const pageNameFor = (section: string, title: string) => {
  const file = fileNameFromTitle(title)
  const dir = section.trim().replace(/^\/+|\/+$/g, '')
  return file === '' ? '' : dir === '' ? file : `${dir}/${file}`
}

export type FieldProblems = Partial<Record<'name' | 'title' | 'description' | 'tags' | 'properties' | 'content' | 'frontMatter', string[]>>

export function groupByField(problems: KnowledgePageProblem[]): FieldProblems {
  const out: FieldProblems = {}
  for (const p of problems) {
    const key = p.field === 'links' ? null : p.field
    if (key) (out[key] ??= []).push(p.message)
  }
  return out
}

/** What is wrong with the fields as they stand: shown on each field while the person types. */
export function fieldProblems(state: EditorState, page: string | null, isNew: boolean): FieldProblems {
  const found: KnowledgePageProblem[] = []
  if (state.title !== '' || !isNew) found.push(...checkPageTitle(state.title))
  if (state.description !== '' || !isNew) found.push(...checkPageDescription(state.description))
  found.push(...checkPageTags(state.tags), ...checkPageProperties(propertiesOf(state.properties)))
  const out = groupByField(found)
  if (isNew) {
    const dirProblem = sectionNameProblem(state.section.trim().replace(/^\/+|\/+$/g, ''))
    const name = page ?? ''
    const nameProblems = dirProblem ? [dirProblem] : name !== '' ? checkPageName(name).map(p => p.message) : []
    if (nameProblems.length) out.name = nameProblems
  }
  return out
}

export const hasAny = (p: FieldProblems) => Object.values(p).some(v => v && v.length > 0)

/** The properties the pages of a section use, each offered with the values it holds there. */
export function offeredProperties(pages: KnowledgePageRow[], section: string | null): { name: string; values: string[] }[] {
  const inSection = section === null ? pages : pages.filter(p => sectionOfPage(p.page) === section)
  const seen = new Map<string, Set<string>>()
  for (const p of inSection) {
    for (const [name, value] of Object.entries(p.properties)) {
      const values = seen.get(name) ?? new Set<string>()
      for (const v of Array.isArray(value) ? value : [value]) if (v !== '') values.add(v)
      seen.set(name, values)
    }
  }
  return [...seen.entries()].map(([name, v]) => ({ name, values: [...v].sort() })).sort((a, b) => a.name.localeCompare(b.name))
}
