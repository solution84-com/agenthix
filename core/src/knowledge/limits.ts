/**
 * The numbers the page rules T1–T4 (agent knowledge spec, part 2) hold a page to. One set, read by the site's gate,
 * the itemiser, hq's editor and the knowledge tools' descriptions, so the limit a person is told is the one applied.
 */
export const KNOWLEDGE_LIMITS = {
  /** T1: folders a page may sit under. */
  maxSectionDepth: 8,
  /** The longest one name in a page's path may be, in characters: what a file system takes. */
  maxNameLength: 255,
  /** T2 */
  maxTitleChars: 120,
  maxDescriptionChars: 300,
  maxTags: 8,
  /** T3: front-matter fields of the place's own. */
  maxProperties: 20,
  /** T4: a page's bytes, front matter included. */
  maxPageBytes: 64 * 1024,
  /** T4: pages in one place. */
  maxPages: 2000,
} as const

/** The file ending every page has. */
export const KNOWLEDGE_PAGE_EXTENSION = '.md'
