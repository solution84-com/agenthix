/**
 * A small Markdown reader for the guide's pages: the Markdown goes in, a tree of plain data comes out, and
 * `renderMarkdown.tsx` turns that tree into React elements. Only what the guide's pages use is understood; nothing
 * here produces HTML, so a `<tag>` written in a page stays the text it is.
 */

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'strong'; children: Inline[] }
  | { t: 'em'; children: Inline[] }
  | { t: 'link'; href: string; children: Inline[] }

export type Block =
  | { t: 'heading'; level: 2 | 3 | 4; id: string; children: Inline[] }
  | { t: 'para'; children: Inline[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'list'; ordered: boolean; items: Block[][] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'image'; alt: string; src: string }

export interface Page {
  title: string
  description: string
  order: number
  blocks: Block[]
}

/** The front matter's `title`, `description` and `sidebar.order`; the rest of the file is the page. */
export function parsePage(source: string): Page {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source.replace(/\r\n/g, '\n'))
  const front = m ? m[1] : ''
  const body = m ? m[2] : source
  const field = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(front)?.[1].trim() ?? ''
  return {
    title: field('title'),
    description: field('description'),
    order: Number(/^\s+order:\s*(\d+)/m.exec(front)?.[1] ?? 999),
    blocks: parseBlocks(body.split('\n')),
  }
}

/** A heading's address, in GitHub's form: `## What you need` is `what-you-need`. */
export function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-')
}

export function plainText(inlines: Inline[]): string {
  return inlines.map(i => (i.t === 'text' || i.t === 'code' ? i.text : plainText(i.children))).join('')
}

const FENCE = /^\s*```\s*([\w-]*)\s*$/
const BULLET = /^(\s*)([-*])\s+(.*)$/
const NUMBERED = /^(\s*)(\d+)\.\s+(.*)$/
const HEADING = /^(#{2,4})\s+(.*?)\s*#*\s*$/
const ROW = /^\s*\|.*\|\s*$/

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const fence = FENCE.exec(line)
    if (fence) {
      const indent = line.length - line.trimStart().length
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        const row = lines[i++]
        body.push(row.slice(Math.min(indent, row.length - row.trimStart().length)))
      }
      i++
      blocks.push({ t: 'code', lang: fence[1], text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const children = parseInline(heading[2])
      blocks.push({ t: 'heading', level: heading[1].length as 2 | 3 | 4, id: slugOf(plainText(children)), children })
      i++
      continue
    }

    if (ROW.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = cells(line).map(parseInline)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && ROW.test(lines[i])) rows.push(cells(lines[i++]).map(parseInline))
      blocks.push({ t: 'table', head, rows })
      continue
    }

    const first = BULLET.exec(line) ?? NUMBERED.exec(line)
    if (first && first[1].length === 0) {
      const ordered = NUMBERED.test(line)
      const marker = ordered ? NUMBERED : BULLET
      const items: Block[][] = []
      while (i < lines.length) {
        const start = marker.exec(lines[i])
        if (!start || start[1].length !== 0) break
        const width = lines[i].length - start[3].length
        const body = [start[3]]
        i++
        // The item goes on while lines are indented, or blank with an indented line after them.
        while (i < lines.length) {
          const next = lines[i]
          if (next.trim() === '') {
            let j = i
            while (j < lines.length && lines[j].trim() === '') j++
            if (j < lines.length && /^\s+\S/.test(lines[j])) { body.push(''); i++; continue }
            break
          }
          if (!/^\s/.test(next)) break
          body.push(next.slice(Math.min(width, next.length - next.trimStart().length)))
          i++
        }
        items.push(parseBlocks(body))
        let j = i
        while (j < lines.length && lines[j].trim() === '') j++
        if (j < lines.length && marker.test(lines[j]) && marker.exec(lines[j])![1].length === 0) i = j
        else break
      }
      blocks.push({ t: 'list', ordered, items })
      continue
    }

    const image = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(line)
    if (image) { blocks.push({ t: 'image', alt: image[1], src: image[2] }); i++; continue }

    const text: string[] = []
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !(text.length && (BULLET.test(lines[i]) || NUMBERED.test(lines[i]))) && !ROW.test(lines[i])) text.push(lines[i++].trim())
    if (!text.length) { text.push(lines[i++].trim()) }
    blocks.push({ t: 'para', children: parseInline(text.join(' ')) })
  }
  return blocks
}

/** A table row's cells; `\|` is a bar inside a cell, and a bar inside backticks does not split. */
function cells(row: string): string[] {
  const out: string[] = []
  let cell = ''
  let inCode = false
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  for (let k = 0; k < inner.length; k++) {
    const c = inner[k]
    if (c === '\\' && inner[k + 1] === '|') { cell += '|'; k++ }
    else if (c === '`') { inCode = !inCode; cell += c }
    else if (c === '|' && !inCode) { out.push(cell.trim()); cell = '' }
    else cell += c
  }
  out.push(cell.trim())
  return out
}

const TOKEN = /`([^`]+)`|\*\*(.+?)\*\*|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|!?\[([^\]]*)\]\(([^)\s]*)\)/

export function parseInline(source: string): Inline[] {
  const out: Inline[] = []
  let rest = source
  while (rest) {
    const m = TOKEN.exec(rest)
    if (!m) { out.push({ t: 'text', text: rest }); break }
    if (m.index > 0) out.push({ t: 'text', text: rest.slice(0, m.index) })
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'strong', children: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ t: 'em', children: parseInline(m[3]) })
    else if (m[0].startsWith('!')) out.push({ t: 'text', text: m[4] })
    else out.push({ t: 'link', href: m[5], children: parseInline(m[4]) })
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}
