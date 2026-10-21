/**
 * A skill's `description` from its `SKILL.md` front matter, for the skill list
 * an OpenCode turn's system prompt carries (spec §7).
 *
 * OpenCode reads front matter as YAML. This reads the one key it lists, in the
 * forms skill files use: a plain value (continued on indented lines), a single-
 * or double-quoted one, or a `|` or `>` block. Anything else — no front matter,
 * no description, an empty one — is no description, and OpenCode lists no
 * skill without one.
 */

const BOM = String.fromCharCode(0xfeff)
const keyPattern = (key: string) => new RegExp(`^(?:${key}|"${key}"|'${key}')[ \\t]*:(.*)$`)

function frontMatter(markdown: string): string[] | null {
  const text = markdown.startsWith(BOM) ? markdown.slice(1) : markdown
  const lines = text.split(/\r\n|\r|\n/)
  if (lines[0]?.trimEnd() !== '---') return null
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
  return close === -1 ? null : lines.slice(1, close)
}

const indentOf = (line: string) => line.length - line.trimStart().length

function block(header: string, following: string[]): string {
  const folded = header.startsWith('>')
  const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip'
  const body: string[] = []
  let indent = -1
  for (const line of following) {
    if (line.trim() === '') { body.push(''); continue }
    if (indent === -1) indent = indentOf(line)
    if (indentOf(line) < indent || indent === 0) break
    body.push(line.slice(indent))
  }
  while (body.length > 0 && body[body.length - 1] === '' && chomp !== 'keep') body.pop()
  let text = folded
    ? body.reduce((acc, line, i) => {
        if (i === 0) return line
        if (line === '') return acc + '\n'
        return acc.endsWith('\n') || acc === '' ? acc + line : `${acc} ${line}`
      }, '')
    : body.join('\n')
  if (chomp !== 'strip' && text !== '') text += '\n'
  return text
}

function continued(first: string, following: string[]): string {
  const parts = [first]
  for (const line of following) {
    if (line.trim() === '' || indentOf(line) === 0) break
    parts.push(line.trim())
  }
  return parts.join(' ')
}

function unquoteDouble(body: string): string {
  return body.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})/g, (_m, c: string) => {
    const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
    return c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : map[c]
  })
}

function quoted(value: string, quote: '"' | "'"): string | undefined {
  const pattern = quote === '"' ? /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/ : /^'((?:[^']|'')*)'\s*(?:#.*)?$/
  const match = value.match(pattern)
  if (!match) return undefined
  return quote === '"' ? unquoteDouble(match[1]) : match[1].replaceAll("''", "'")
}

/** The description, or undefined when there is none OpenCode would list. */
export function skillDescription(markdown: string): string | undefined {
  return frontMatterString(markdown, 'description')
}

/**
 * A top-level front matter key's string value, read as `skillDescription`
 * reads the description; undefined when absent, empty or in another form.
 * `key` is a plain name (letters, digits, `-`, `_`).
 */
export function frontMatterString(markdown: string, key: string): string | undefined {
  const header = frontMatter(markdown)
  if (!header) return undefined
  const pattern = keyPattern(key)
  const at = header.findIndex(l => pattern.test(l))
  if (at === -1) return undefined
  const rest = (header[at].match(pattern)?.[1] ?? '').trim()
  const following = header.slice(at + 1)

  let value: string | undefined
  if (/^[|>][-+0-9]*\s*(?:#.*)?$/.test(rest)) value = block(rest, following)
  else if (rest.startsWith('"') || rest.startsWith("'")) {
    value = quoted(continued(rest, following), rest[0] as '"' | "'")
  } else {
    value = continued(rest.replace(/\s+#.*$/, ''), following).trim()
    if (value === '' || value === '~' || value === 'null') value = undefined
  }
  return value === '' ? undefined : value
}
