/**
 * The page rules (agent knowledge spec, part 2): T1–T4 for a change, T1–T5 for a listing. One set, used by the
 * site's gate (a change with any problem is refused and nothing is stored), the itemiser (a page with problems is
 * still listed, with them) and hq's editor (each problem on its field as the person types). No Node import: this
 * runs in the browser too.
 */
import { KNOWLEDGE_LIMITS as L } from './limits.js'
import { parseFrontMatter, type FrontMatterField, type FrontMatterValue } from './frontMatter.js'
import { pageLinks } from './links.js'
import { checkPageName, titleFromPageName } from './pageNames.js'
import { knowledgeProblem, type KnowledgePageProblem } from './problems.js'

/** A tag (T2): lower-case words of letters and digits, joined by hyphens. */
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RESERVED = new Set(['title', 'description', 'tags'])
// A line break or a control character (a tab is fine): a field's value is one line of plain text.
const NOT_ONE_LINE = /[\u0000-\u0008\u000a-\u001f\u007f]/

/** A page's index entry: what a listing shows of it, read from its front matter. */
export interface KnowledgePageSummary {
  /** The title, or the file name without `.md` while the page has none it can use. */
  title: string
  description: string
  tags: string[]
  /** The place's own fields, as written, in the page's order. */
  properties: Record<string, string | string[]>
}

export interface KnowledgePageCheck {
  summary: KnowledgePageSummary
  problems: KnowledgePageProblem[]
}

export interface PageChangeContext {
  /** True when the change makes a page that is not there yet; with `pagesInPlace`, checks the place's page count. */
  creating?: boolean
  /** How many pages the place holds before the change. */
  pagesInPlace?: number
}

/** The count of characters a person sees, not of UTF-16 units: an emoji is one. */
const chars = (s: string) => Array.from(s).length

/** UTF-8 length, without an encoder (core's root runs where `TextEncoder` may not be declared). */
export function utf8Bytes(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++ }
    else n += 3
  }
  return n
}

// ── One field at a time, as hq's editor checks them while a person types ────

export function checkPageTitle(title: string): KnowledgePageProblem[] {
  const t = title.trim()
  if (t === '') return [knowledgeProblem.titleMissing()]
  if (NOT_ONE_LINE.test(t)) return [knowledgeProblem.titleNotText()]
  return chars(t) > L.maxTitleChars ? [knowledgeProblem.titleTooLong(chars(t))] : []
}

export function checkPageDescription(description: string): KnowledgePageProblem[] {
  const d = description.trim()
  if (d === '') return [knowledgeProblem.descriptionMissing()]
  if (NOT_ONE_LINE.test(d)) return [knowledgeProblem.descriptionNotText()]
  return chars(d) > L.maxDescriptionChars ? [knowledgeProblem.descriptionTooLong(chars(d))] : []
}

export function checkPageTags(tags: readonly string[]): KnowledgePageProblem[] {
  const out: KnowledgePageProblem[] = []
  if (tags.length > L.maxTags) out.push(knowledgeProblem.tagsTooMany(tags.length))
  const seen = new Set<string>()
  for (const tag of tags) {
    if (tag.trim() === '') out.push(knowledgeProblem.tagEmpty())
    else if (TAG.test(tag.toLowerCase()) && tag !== tag.toLowerCase()) out.push(knowledgeProblem.tagNotLowerCase(tag))
    else if (!TAG.test(tag)) out.push(knowledgeProblem.tagInvalid(tag))
    else if (seen.has(tag)) out.push(knowledgeProblem.tagRepeated(tag))
    seen.add(tag)
  }
  return out
}

export function checkPageProperties(properties: Readonly<Record<string, string | readonly string[]>>): KnowledgePageProblem[] {
  const out: KnowledgePageProblem[] = []
  const names = Object.keys(properties)
  if (names.length > L.maxProperties) out.push(knowledgeProblem.propertiesTooMany(names.length))
  for (const name of names) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
      out.push(knowledgeProblem.propertyInvalid(name, 'is not a field name: use letters, digits, hyphens and underscores, starting with a letter'))
    } else if (RESERVED.has(name)) {
      out.push(knowledgeProblem.propertyInvalid(name, 'is a field every page has, not a property'))
    }
    const value = properties[name]
    const values: readonly string[] = typeof value === 'string' ? [value] : value
    if (values.some(v => NOT_ONE_LINE.test(v))) out.push(knowledgeProblem.propertyInvalid(name, 'must be one line of plain text'))
  }
  return out
}

// ── A whole page ────────────────────────────────────────────────────────────

/** T2 and T3 over parsed fields: the summary they give, and their problems. */
function readFields(name: string, fields: FrontMatterField[]): KnowledgePageCheck {
  const byName = new Map(fields.map(f => [f.name, f.value]))
  const problems: KnowledgePageProblem[] = []
  const text = (v: FrontMatterValue | undefined) => (v?.kind === 'text' ? v.text.trim() : '')

  const title = byName.get('title')
  if (title?.kind === 'list') problems.push(knowledgeProblem.titleNotText())
  else problems.push(...checkPageTitle(text(title)))

  const description = byName.get('description')
  if (description?.kind === 'list') problems.push(knowledgeProblem.descriptionNotText())
  else problems.push(...checkPageDescription(text(description)))

  const tagsValue = byName.get('tags')
  let tags: string[] = []
  if (tagsValue?.kind === 'list') tags = tagsValue.items
  else if (tagsValue && tagsValue.text !== '') problems.push(knowledgeProblem.tagsNotList())
  problems.push(...checkPageTags(tags))

  const properties: Record<string, string | string[]> = {}
  for (const f of fields) {
    if (RESERVED.has(f.name)) continue
    properties[f.name] = f.value.kind === 'text' ? f.value.text : f.value.items
  }
  problems.push(...checkPageProperties(properties))

  const usableTitle = !problems.some(p => p.field === 'title')
  return {
    summary: {
      title: usableTitle ? text(title) : titleFromPageName(name),
      description: text(description),
      tags: tags.filter(t => TAG.test(t)),
      properties,
    },
    problems,
  }
}

/**
 * T1–T4 for a change at the gate: the page `name` inside its level, with this whole text. Any problem refuses the
 * change. Links are not checked: a page may link to one not written yet.
 */
export function checkPageChange(name: string, content: string, context: PageChangeContext = {}): KnowledgePageCheck {
  const problems = [...checkPageName(name)]
  if (context.creating && context.pagesInPlace !== undefined && context.pagesInPlace >= L.maxPages) problems.push(knowledgeProblem.tooManyPages())
  const bytes = utf8Bytes(content)
  if (bytes > L.maxPageBytes) {
    // Not read further: the size alone refuses it, and a person fixes that first.
    return { summary: emptySummary(name), problems: [...problems, knowledgeProblem.tooLarge(bytes)] }
  }
  const fm = parseFrontMatter(content)
  if (fm.problems.length) return { summary: emptySummary(name), problems: [...problems, ...fm.problems] }
  const read = readFields(name, fm.fields)
  return { summary: read.summary, problems: [...problems, ...read.problems] }
}

export interface PageListingContext {
  /**
   * Whether a linked page exists: `level` null for the page's own level. `undefined` when it cannot be known here
   * (another level's pages, on another site), which is not a knowledgeProblem.
   */
  pageExists(level: string | null, page: string): boolean | undefined
}

/**
 * T1–T5 for the itemiser: a page as it is on the disk, with everything wrong with it. Never refuses; a page with
 * problems is listed with them, titled from its file name until it has a title.
 */
export function checkPageForListing(name: string, content: string, context: PageListingContext): KnowledgePageCheck {
  const checked = checkPageChange(name, content)
  if (checked.problems.some(p => p.code === 'too_large')) return checked
  const fm = parseFrontMatter(content)
  const problems = [...checked.problems]
  for (const link of pageLinks(name, fm.body, fm.bodyLine)) {
    if (link.page === null) problems.push(knowledgeProblem.linkOutside(link.target, link.line))
    else if (context.pageExists(link.level, link.page) === false) problems.push(knowledgeProblem.linkBroken(link.target, link.line))
  }
  return { summary: checked.summary, problems }
}

function emptySummary(name: string): KnowledgePageSummary {
  return { title: titleFromPageName(name), description: '', tags: [], properties: {} }
}
