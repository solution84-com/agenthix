/**
 * Page names (T1) and level names (agent knowledge spec, part 3, *Levels are names, not parameters*).
 *
 * Inside a level a page is named by its path from the level's pages folder, forward-slashed:
 * `processes/release.md`. Across levels it is that path behind its level and a colon:
 * `website-rebuild:processes/release.md`, `org:how-we-work/code-review.md`, `platform:your-tools/providers.md`.
 * A search hit's mark is exactly this name, so it can be handed to `read_knowledge` as it is.
 *
 * These checks are about the NAME only. Whether a name stays inside its root on the disk, links included, is the
 * file tools' to decide (`@agenthix/core/file-tools`); a name that passes here still goes through that.
 */
import { KNOWLEDGE_LIMITS as L, KNOWLEDGE_PAGE_EXTENSION } from './limits.js'
import { knowledgeProblem, type KnowledgePageProblem } from './problems.js'

/** Letters, digits, hyphens, underscores and dots; never starting with a dot (no hidden names, no `..`). */
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

/** The levels every agent may name, besides the places it holds. */
export const KNOWLEDGE_LEVELS = { org: 'org', platform: 'platform', personal: 'personal' } as const

/** A level's name: `org`, `platform`, `personal`, or a project's name as its pages are named (`website-rebuild`). */
export const KNOWLEDGE_LEVEL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const KNOWLEDGE_LEVEL_NAME_MAX = 64

/** The problems with a page's name inside its level, under T1. Empty when it is a page's name. */
export function checkPageName(name: string): KnowledgePageProblem[] {
  const why = pageNameProblem(name)
  return why ? [knowledgeProblem.nameInvalid(why)] : []
}

function pageNameProblem(name: string): string | null {
  if (name === '') return 'the page has no name'
  if (name.startsWith('/') || name.includes('\\')) return 'a page name is a path inside the level, with forward slashes, like processes/release.md'
  if (!name.endsWith(KNOWLEDGE_PAGE_EXTENSION)) return `a page is a Markdown file: its name ends in ${KNOWLEDGE_PAGE_EXTENSION}`
  const segments = name.split('/')
  if (segments.length - 1 > L.maxSectionDepth) return `a page may sit at most ${L.maxSectionDepth} sections deep`
  for (const s of segments) {
    if (s === '') return 'a page name has an empty part between slashes'
    if (s.startsWith('.')) return `'${s.slice(0, 40)}' starts with a dot: hidden names are not used`
    if (!SEGMENT.test(s)) return `'${s.slice(0, 40)}' may use only letters, digits, hyphens, underscores and dots`
    if (s.length > L.maxNameLength) return `a name in the path is over ${L.maxNameLength} characters`
  }
  return null
}

/** A section's name (a folder path inside the level, no trailing slash), under T1. Null when it is fine. */
export function sectionNameProblem(section: string): string | null {
  if (section === '') return null
  const segments = section.split('/')
  if (segments.length > L.maxSectionDepth) return `a section may be at most ${L.maxSectionDepth} deep`
  for (const s of segments) {
    if (s === '' || s.startsWith('.') || !SEGMENT.test(s) || s.length > L.maxNameLength) {
      return 'a section name may use only letters, digits, hyphens, underscores and dots, not starting with a dot'
    }
  }
  return null
}

/** What a page is called while it has no title: its file name without `.md`. */
export function titleFromPageName(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1)
  return base.endsWith(KNOWLEDGE_PAGE_EXTENSION) ? base.slice(0, -KNOWLEDGE_PAGE_EXTENSION.length) : base
}

/** The section a page is in: its folder path, `''` at the level's top. */
export function sectionOfPage(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? '' : name.slice(0, slash)
}

export interface QualifiedPageName {
  level: string
  page: string
}

/** `website-rebuild:processes/release.md` from its two parts. */
export function qualifiedPageName(level: string, page: string): string {
  return `${level}:${page}`
}

/**
 * The level and the page of a name an agent or a link gives, or null when it does not start with a level. The
 * level is only read here: whether the caller may reach it is decided by whoever holds the levels.
 */
export function parseQualifiedPageName(name: string): QualifiedPageName | null {
  const colon = name.indexOf(':')
  if (colon <= 0) return null
  const level = name.slice(0, colon)
  if (level.length > KNOWLEDGE_LEVEL_NAME_MAX || !KNOWLEDGE_LEVEL_NAME.test(level)) return null
  return { level, page: name.slice(colon + 1) }
}
