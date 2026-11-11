/**
 * A path an agent writes in its reply without making it a link — `files/reports/q3.pdf` in a sentence, or the same in
 * backticks — becomes a link to it, so the reply draws it as a chip (spec part 3, *Chips in conversations*). Only for
 * text read in an owner's whole folder (a conversation's place), where those folders are what the agent sees.
 * Text already inside a link or a code block is left as it is.
 */
import { referenceLabel, splitReferences } from '../../../storage/pages/fileReferences'

type Point = { line: number; column: number; offset?: number }
type Position = { start: Point; end: Point }
type MdNode = { type: string; value?: string; url?: string; children?: MdNode[]; position?: Position }

const isReference = (value: string) => {
  const pieces = splitReferences(value.trim(), null)
  return pieces.length === 1 && pieces[0].kind === 'reference'
}

function linkTo(reference: string, label: MdNode): MdNode {
  return { type: 'link', url: reference, children: [label], ...(label.position && { position: label.position }) }
}

/** `from` moved on by `text`, as the source reads it. */
function advance(from: Point, text: string): Point {
  let { line, column } = from
  for (const ch of text) {
    if (ch === '\n') { line++; column = 1 } else column++
  }
  return { line, column, ...(from.offset !== undefined && { offset: from.offset + text.length }) }
}

/**
 * The pieces a text node splits into keep their place in the source, so what reads the tree by place still finds them
 * (a reply's new words revealed as they arrive, `reveal/rehypeReveal`).
 */
function placed(node: MdNode, value: string): (piece: string) => Position | undefined {
  const start = node.position?.start
  let cursor = 0
  return (piece) => {
    if (!start) return undefined
    const at = value.indexOf(piece, cursor)
    if (at < 0) return undefined
    cursor = at + piece.length
    const from = advance(start, value.slice(0, at))
    return { start: from, end: advance(from, piece) }
  }
}

function rewrite(children: MdNode[]): MdNode[] {
  const out: MdNode[] = []
  for (const child of children) {
    if (child.type === 'text' && child.value) {
      const place = placed(child, child.value)
      for (const piece of splitReferences(child.value, null)) {
        if (piece.kind === 'reference') {
          const position = place(piece.reference)
          out.push(linkTo(piece.reference, { type: 'text', value: referenceLabel(piece.reference), ...(position && { position }) }))
        } else if (piece.kind === 'text') {
          const position = place(piece.text)
          out.push({ type: 'text', value: piece.text, ...(position && { position }) })
        }
      }
    } else if (child.type === 'inlineCode' && child.value && isReference(child.value)) {
      const reference = child.value.trim()
      out.push(linkTo(reference, { type: 'text', value: referenceLabel(reference), ...(child.position && { position: child.position }) }))
    } else {
      if (child.children && child.type !== 'link' && child.type !== 'linkReference') child.children = rewrite(child.children)
      out.push(child)
    }
  }
  return out
}

export function remarkReferences() {
  return (tree: MdNode) => {
    if (tree.children) tree.children = rewrite(tree.children)
  }
}
