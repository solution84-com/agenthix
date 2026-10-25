/**
 * The glossary page (docs/guide/glossary.md): one `## Term` per word, with its text beneath. A line "Also said: a, b."
 * lists what else people call it. A glossary that does not read this way fails the build.
 */
import { splitFrontMatter } from './frontMatter'

export type GlossaryTerm = { term: string; also: string[] }

export function parseGlossary(source: string): GlossaryTerm[] {
  const { body } = splitFrontMatter(source, 'the glossary')
  const terms: GlossaryTerm[] = []
  const seen = new Set<string>()
  let current: { term: string; lines: string[] } | null = null
  const close = () => {
    if (!current) return
    const text = current.lines.join('\n').trim()
    if (!text) throw new Error(`The glossary entry "${current.term}" has no text.`)
    const also = /^Also said:\s*(.+?)\.?\s*$/m.exec(text)
    terms.push({ term: current.term, also: also ? also[1].split(',').map(s => s.trim()).filter(Boolean) : [] })
  }
  let inFence = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const heading = inFence ? null : /^##\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      close()
      const term = heading[1].trim()
      if (!term) throw new Error('The glossary has an entry with no word.')
      const key = term.toLowerCase()
      if (seen.has(key)) throw new Error(`The glossary has "${term}" twice.`)
      seen.add(key)
      current = { term, lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  close()
  if (terms.length === 0) throw new Error('The glossary has no entries: each word is a "## Word" heading with its text beneath.')
  return terms
}
