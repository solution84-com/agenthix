/**
 * A path a run's result writes — `pages/work.md` in a sentence, or the same in backticks — that names a file of the
 * task's own folder becomes a link to it, which the task's text draws as a chip opening the file beside the task.
 * Only a path the folder's listing has is linked: nothing is guessed. Text inside a link or a code block is left as
 * it is.
 */

export interface FileSpan {
  start: number
  end: number
  /** The file's path in the task's folder. */
  path: string
}

// A run of characters a path is written in; spaces end it, so a name with a space is found only in backticks.
const WORD = /[\p{L}\p{N}_\-.~+@/]+/gu
const TRAILING = /[.]+$/

/** Each path-like word of the text, without a sentence's full stop after it or a `./` or `/` before it. */
function words(text: string): FileSpan[] {
  const out: FileSpan[] = []
  for (const match of text.matchAll(WORD)) {
    let start = match.index
    let word = match[0].replace(TRAILING, '')
    const lead = /^(\.\/|\/)/.exec(word)?.[0] ?? ''
    start += lead.length
    word = word.slice(lead.length)
    if (word && (word.includes('/') || word.includes('.'))) out.push({ start, end: start + word.length, path: word })
  }
  return out
}

/** The spans of the text that name a file of the folder, given every file path the folder's listing has. */
export function fileSpans(text: string, files: ReadonlySet<string>): FileSpan[] {
  if (files.size === 0) return []
  return words(text).filter(w => files.has(w.path))
}

/** The folders, '' for the top, whose listings say whether the paths the text writes are files; at most `max`. */
export function foldersNamed(text: string, max: number): string[] {
  const folders: string[] = []
  for (const { path } of words(text)) {
    const folder = path.split('/').slice(0, -1).join('/')
    if (!folders.includes(folder)) folders.push(folder)
    if (folders.length === max) break
  }
  return folders
}

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] }

// From the folder's top, so a first part such as `files` stays in the task's folder rather than naming the project's.
const hrefOf = (path: string) => `/${path.split('/').map(encodeURIComponent).join('/')}`
const linkTo = (path: string, label: MdNode): MdNode => ({ type: 'link', url: hrefOf(path), children: [label] })

function rewrite(children: MdNode[], files: ReadonlySet<string>): MdNode[] {
  const out: MdNode[] = []
  for (const child of children) {
    if (child.type === 'text' && child.value) {
      let at = 0
      for (const span of fileSpans(child.value, files)) {
        if (span.start > at) out.push({ type: 'text', value: child.value.slice(at, span.start) })
        out.push(linkTo(span.path, { type: 'text', value: child.value.slice(span.start, span.end) }))
        at = span.end
      }
      if (at === 0) out.push(child)
      else if (at < child.value.length) out.push({ type: 'text', value: child.value.slice(at) })
    } else if (child.type === 'inlineCode' && child.value) {
      const path = child.value.trim().replace(/^(\.\/|\/)/, '')
      out.push(files.has(path) ? linkTo(path, child) : child)
    } else {
      if (child.children && child.type !== 'link' && child.type !== 'linkReference') child.children = rewrite(child.children, files)
      out.push(child)
    }
  }
  return out
}

/** The remark plugin: links the paths of `files` the text writes. */
export function remarkTaskFiles({ files }: { files: ReadonlySet<string> }) {
  return (tree: MdNode) => {
    if (tree.children && files.size > 0) tree.children = rewrite(tree.children, files)
  }
}
