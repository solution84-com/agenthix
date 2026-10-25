/**
 * Links between pages (T5): relative Markdown links inside a level, and `org:how-we-work/code-review.md` (any
 * level's name and a colon) across levels. A link that leads to no page is a problem the itemiser lists; it never
 * refuses a change, so pages can be written in any order.
 *
 * Only links to `.md` targets are pages' links. A web address, a mail link, an anchor on the same page or a link to
 * any other file is not checked here. Links inside code (fenced blocks and `inline code`) are not links.
 */
import { KNOWLEDGE_PAGE_EXTENSION } from './limits.js'
import { parseQualifiedPageName, sectionOfPage } from './pageNames.js'

export interface KnowledgePageLink {
  /** As written in the page. */
  target: string
  /** The 1-based line of the page it is on. */
  line: number
  /** The level it names (`org`), or null for a page of the same level. */
  level: string | null
  /** The page it leads to inside that level, resolved; null when it climbs out of the level's pages. */
  page: string | null
}

// Written so a hostile line cannot make the matcher backtrack: link text holds no bracket (so a run of `[` costs one
// step each), and the optional title's leading spaces cannot trade places with the spaces before `)`.
const INLINE_LINK = /!?\[[^[\]\n]*\]\(\s*<?([^()\s<>]+)>?(?:\s+"[^"\n]*"|\s+'[^'\n]*')?\s*\)/g
const REFERENCE = /^ {0,3}\[[^\]\n]+\]:\s*<?([^\s<>]+)>?/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//
// Addresses without `//` that are never a level's name.
const OTHER_SCHEMES = /^(?:mailto|tel|sms|data|javascript|vbscript|file|news|urn):/i

/**
 * Every page link in a page's body. `name` is the page's own name inside its level, against which relative links
 * resolve; `firstLine` is the page's line the body starts on.
 */
export function pageLinks(name: string, body: string, firstLine = 1): KnowledgePageLink[] {
  const links: KnowledgePageLink[] = []
  let fence: string | null = null
  body.split(/\r?\n/).forEach((text, i) => {
    const line = firstLine + i
    const f = FENCE.exec(text)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      return
    }
    if (fence !== null) return
    const visible = text.replace(/`+[^`]*`+/g, '')
    const ref = REFERENCE.exec(visible)
    if (ref) pushLink(links, name, ref[1], line)
    for (const m of visible.matchAll(INLINE_LINK)) {
      if (!m[0].startsWith('!')) pushLink(links, name, m[1], line)
    }
  })
  return links
}

function pushLink(out: KnowledgePageLink[], from: string, raw: string, line: number): void {
  if (SCHEME.test(raw) || OTHER_SCHEMES.test(raw) || raw.startsWith('#') || raw.startsWith('/')) return
  let target = raw
  try { target = decodeURIComponent(raw) } catch { /* left as written */ }
  const path = target.replace(/[?#].*$/, '')
  if (!path.endsWith(KNOWLEDGE_PAGE_EXTENSION)) return
  const qualified = parseQualifiedPageName(path)
  if (qualified) {
    out.push({ target: raw, line, level: qualified.level, page: resolve('', qualified.page) })
    return
  }
  if (path.includes(':')) return // another scheme (`mailto:`), not a page
  out.push({ target: raw, line, level: null, page: resolve(sectionOfPage(from), path) })
}

/** `path` relative to `section`, or null when `..` climbs above the level's pages. */
function resolve(section: string, path: string): string | null {
  const parts = section === '' ? [] : section.split('/')
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else parts.push(part)
  }
  return parts.length ? parts.join('/') : null
}
