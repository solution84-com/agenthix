/**
 * SKILL.md in its parts, as a person reads and writes it (board *A skill's page*, *The editor*): the name and the
 * description from its front matter, and its body, with the line the body starts on so a line number means the same
 * in the file and in the part shown. Writing a field changes that key only; every other line of the file stays as it
 * was. Client-safe.
 */
import { isMap, parseDocument } from 'yaml'

export type SkillMdFields = { name: string; description: string }

export type SkillMdParts = {
  /** Null when the file has no front matter that can be read: it is then shown and written whole. */
  fields: SkillMdFields | null
  /** The front matter's lines as written, between the two `---` lines. */
  header: string
  body: string
  /** The body's first line in the file, counted from 1. */
  bodyLine: number
}

const BOM = String.fromCharCode(0xfeff)

function frontMatter(text: string): { open: number; close: number; lines: string[] } | null {
  const lines = text.split('\n')
  const first = (lines[0] ?? '').replace(BOM, '')
  if (first.trimEnd() !== '---') return null
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
  return close === -1 ? null : { open: 0, close, lines }
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))

export function skillMdParts(text: string): SkillMdParts {
  const fm = frontMatter(text)
  if (!fm) return { fields: null, header: '', body: text, bodyLine: 1 }
  const header = fm.lines.slice(1, fm.close).join('\n')
  const body = fm.lines.slice(fm.close + 1).join('\n')
  const doc = parseDocument(header, { uniqueKeys: true, maxAliasCount: 10 } as Parameters<typeof parseDocument>[1])
  const map = doc.contents
  const readable = doc.errors.length === 0 && (map === null || isMap(map))
  return {
    fields: readable ? { name: asText(doc.get('name')), description: asText(doc.get('description')) } : null,
    header, body, bodyLine: fm.close + 2,
  }
}

/** The file with one front-matter key set; the other keys, and the body, as they were. */
export function withSkillMdField(text: string, key: keyof SkillMdFields, value: string): string {
  const fm = frontMatter(text)
  if (!fm) return text
  const doc = parseDocument(fm.lines.slice(1, fm.close).join('\n'))
  if (doc.errors.length) return text
  doc.set(key, value)
  const header = doc.toString({ lineWidth: 0 }).replace(/\n$/, '')
  return [fm.lines[0], header, ...fm.lines.slice(fm.close)].join('\n')
}

/** The file with its body replaced, the front matter as it was. */
export function withSkillMdBody(text: string, body: string): string {
  const fm = frontMatter(text)
  if (!fm) return body
  return [...fm.lines.slice(0, fm.close + 1), body].join('\n')
}
