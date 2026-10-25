/**
 * What the reader needs of a page's text beyond Markdown: its links resolved the way core's rules resolve them
 * (T5), and its headings. The Markdown renderer drops an address it does not know (`org:...`), so each page link is
 * rewritten to a local anchor the click handler recognises.
 */
import { pageLinks, type KnowledgePageLink } from '@agenthix/core'

const INLINE = /(\[[^[\]\n]*\]\(\s*<?)([^()\s<>]+)(>?(?:\s+"[^"\n]*"|\s+'[^'\n]*')?\s*\))/g
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const CODE_SPAN = /(`+[^`]*`+)/

export const LINK_ANCHOR = '#kp:'

export interface ReadableText {
  /** The Markdown to render, with page links pointing at `#kp:<n>`. */
  text: string
  links: KnowledgePageLink[]
}

export function readableText(page: string, body: string): ReadableText {
  const links: KnowledgePageLink[] = []
  let fence: string | null = null
  const text = body.split(/\r?\n/).map(line => {
    const f = FENCE.exec(line)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      return line
    }
    if (fence !== null) return line
    const here = pageLinks(page, line)
    if (here.length === 0) return line
    return line.split(CODE_SPAN).map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(INLINE, (whole: string, open: string, target: string, close: string, offset: number, source: string) => {
        if (source[offset - 1] === '!') return whole
        const link = here.find(l => l.target === target)
        if (!link) return whole
        links.push(link)
        return `${open}${LINK_ANCHOR}${links.length - 1}${close}`
      })
    }).join('')
  }).join('\n')
  return { text, links }
}

export interface Heading {
  level: number
  text: string
}

/** The headings of a page's text (not those inside code), for *On this page*. */
export function headingsOf(body: string): Heading[] {
  const out: Heading[] = []
  let fence: string | null = null
  for (const line of body.split(/\r?\n/)) {
    const f = FENCE.exec(line)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence !== null) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) out.push({ level: m[1].length, text: m[2] })
  }
  return out
}
