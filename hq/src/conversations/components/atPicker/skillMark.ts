/**
 * The picked skill's `/name`, highlighted in the message field where it was typed. The field is an editable element the
 * browser edits itself, so nothing is added to it: the browser's text highlight (CSS Custom Highlight API) paints a
 * range over the mark, and the caret and a composition keep working as in any text. A browser without it shows the
 * mark as plain text; the skill is picked all the same.
 */
const NAME = 'skill-pick'

type HighlightRegistry = { set(name: string, highlight: unknown): void; delete(name: string): void }
const registry = (): HighlightRegistry | null => (typeof CSS !== 'undefined' ? ((CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null) : null)
const HighlightClass = (): (new (...ranges: Range[]) => unknown) | null =>
  (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight ?? null

// One page can hold several message fields, and the registry has one entry per name.
const marked = new Map<HTMLElement, Range>()

function publish() {
  const reg = registry()
  const Highlight = HighlightClass()
  if (!reg || !Highlight) return
  if (marked.size === 0) reg.delete(NAME)
  else reg.set(NAME, new Highlight(...marked.values()))
}

/** The range over the first `length` characters of the element's text nodes, or null when they are not all plain text. */
function rangeOver(root: HTMLElement, length: number): Range | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = root.ownerDocument.createRange()
  let left = length
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    if (left === length) range.setStart(node, 0)
    if (text.length >= left) { range.setEnd(node, left); return range }
    left -= text.length
  }
  return null
}

/** Marks the first `length` characters of the field's text, or removes the field's mark when `length` is null. */
export function markSkill(root: HTMLElement, length: number | null) {
  const range = length ? rangeOver(root, length) : null
  if (range) marked.set(root, range)
  else if (!marked.delete(root)) return
  publish()
}
