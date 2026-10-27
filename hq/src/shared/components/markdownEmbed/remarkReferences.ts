/**
 * A path an agent writes in its reply without making it a link — `files/reports/q3.pdf` in a sentence, or the same in
 * backticks — becomes a link to it, so the reply draws it as a chip (spec part 3, *Chips in conversations*). Only for
 * text read in an owner's whole folder (a conversation's place), where those folders are what the agent sees.
 * Text already inside a link or a code block is left as it is.
 */
import { referenceLabel, splitReferences } from '../../../storage/pages/fileReferences'

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] }

const isReference = (value: string) => {
  const pieces = splitReferences(value.trim(), null)
  return pieces.length === 1 && pieces[0].kind === 'reference'
}

function linkTo(reference: string, label: MdNode): MdNode {
  return { type: 'link', url: reference, children: [label] }
}

function rewrite(children: MdNode[]): MdNode[] {
  const out: MdNode[] = []
  for (const child of children) {
    if (child.type === 'text' && child.value) {
      for (const piece of splitReferences(child.value, null)) {
        if (piece.kind === 'reference') out.push(linkTo(piece.reference, { type: 'text', value: referenceLabel(piece.reference) }))
        else if (piece.kind === 'text') out.push({ type: 'text', value: piece.text })
      }
    } else if (child.type === 'inlineCode' && child.value && isReference(child.value)) {
      const reference = child.value.trim()
      out.push(linkTo(reference, { type: 'text', value: referenceLabel(reference) }))
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
