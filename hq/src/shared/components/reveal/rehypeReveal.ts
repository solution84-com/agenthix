/**
 * Marks the characters of a rendered Markdown tree that are still being revealed: from `from` on (by place in the
 * reply's text), each character that is not a space becomes a `span` carrying its place (`data-c`) and how visible it
 * is when drawn. The reveal then changes only those spans' opacity, frame by frame. What is before `from` is shown and
 * stays plain text. Text is matched by its place in the Markdown source, so a block that re-parses never reveals again.
 * A code block's text is left alone: its block reads the code as a string.
 */
type Point = { offset?: number }
type HastNode = {
  type: string
  value?: string
  tagName?: string
  position?: { start: Point; end: Point }
  properties?: Record<string, unknown>
  children?: HastNode[]
}

export type RevealMarks = {
  /** Where this Markdown starts in the reply's text. */
  offset: number
  /** The first character, in the reply's text, still being revealed. */
  from: number
  /** How visible character `i` (in the reply's text) is now. */
  opacity: (i: number) => number
}

function pieces(node: HastNode, marks: RevealMarks): HastNode[] | null {
  const value = node.value ?? ''
  const end = node.position?.end.offset
  if (!value.trim() || node.position?.start.offset === undefined || end === undefined) return null
  // A node whose text is shorter than its source (an escape, an entity) is aligned at its end, where text arrives.
  const at = marks.offset + end - value.length
  const first = Math.max(0, marks.from - at)
  if (first >= value.length) return null
  const out: HastNode[] = first > 0 ? [{ type: 'text', value: value.slice(0, first) }] : []
  let plain = ''
  for (let k = first; k < value.length; k++) {
    const ch = value[k]!
    if (/\s/.test(ch)) { plain += ch; continue }
    if (plain) { out.push({ type: 'text', value: plain }); plain = '' }
    out.push({ type: 'element', tagName: 'span', properties: { dataC: at + k, style: `opacity:${marks.opacity(at + k)}` }, children: [{ type: 'text', value: ch }] })
  }
  if (plain) out.push({ type: 'text', value: plain })
  return out
}

function mark(parent: HastNode, marks: RevealMarks) {
  const kids = parent.children
  if (!kids) return
  const out: HastNode[] = []
  for (const child of kids) {
    if (child.type === 'element' && child.tagName === 'pre') { out.push(child); continue }
    if (child.type === 'text' || child.type === 'raw') {
      const split = pieces(child, marks)
      if (split) { out.push(...split); continue }
    }
    mark(child, marks)
    out.push(child)
  }
  parent.children = out
}

export function rehypeReveal(options: { marks: RevealMarks }) {
  return (tree: HastNode) => mark(tree, options.marks)
}
