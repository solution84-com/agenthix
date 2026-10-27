/**
 * The message box's text and the editable field that shows it (spec part 3, *Chips in conversations*). The text is
 * what the box sends — references written as paths — and the field shows each reference as a chip: one element that
 * stands for its whole path, so offsets in the text and places in the field map onto each other.
 */
import { splitReferences } from '../../storage/pages/fileReferences'

export type FieldPiece = { kind: 'text'; text: string } | { kind: 'chip'; reference: string; start: number; end: number }
export type FieldChip = { reference: string; start: number; end: number }

const CHIP_ATTR = 'data-reference'

/**
 * The text in pieces: every reference it names is a chip, except one that ends at `hold` — the one still being
 * typed, which becomes a chip once something follows it.
 */
export function fieldPieces(text: string, hold: number | null): FieldPiece[] {
  const pieces: FieldPiece[] = []
  let at = 0
  for (const p of splitReferences(text, null)) {
    const t = p.kind === 'text' ? p.text : p.kind === 'reference' ? p.reference : p.href
    const last = pieces[pieces.length - 1]
    if (p.kind === 'reference' && at + t.length !== hold) pieces.push({ kind: 'chip', reference: t, start: at, end: at + t.length })
    else if (last?.kind === 'text') pieces[pieces.length - 1] = { kind: 'text', text: last.text + t }
    else pieces.push({ kind: 'text', text: t })
    at += t.length
  }
  // The pieces must spell the text exactly, or what is sent would differ from what is shown.
  return at === text.length ? pieces : [{ kind: 'text', text }]
}

export function chipsOf(pieces: FieldPiece[]): FieldChip[] {
  return pieces.flatMap((p) => (p.kind === 'chip' ? [{ reference: p.reference, start: p.start, end: p.end }] : []))
}

export function sameChips(a: FieldChip[], b: FieldChip[]): boolean {
  return a.length === b.length && a.every((c, i) => c.reference === b[i].reference && c.start === b[i].start)
}

const isElement = (n: Node): n is Element => n.nodeType === 1
const isChip = (n: Node): n is Element => isElement(n) && n.hasAttribute(CHIP_ATTR)
const BLOCKS = new Set(['DIV', 'P'])

type Leaf = { node: Node; text: string; start: number; atomic: boolean }

/** The field's contents in order, each with the text it stands for. A browser's own blocks and line breaks read as new lines. */
function leaves(root: Node): Leaf[] {
  const out: Leaf[] = []
  let at = 0
  const add = (node: Node, text: string, atomic: boolean) => { out.push({ node, text, start: at, atomic }); at += text.length }
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) add(child, child.nodeValue ?? '', false)
      else if (isChip(child)) add(child, child.getAttribute(CHIP_ATTR) ?? '', true)
      else if (isElement(child) && child.tagName === 'BR') add(child, '\n', true)
      else if (isElement(child)) {
        if (BLOCKS.has(child.tagName) && at > 0) add(child, '\n', true)
        visit(child)
      }
    }
  }
  visit(root)
  // A last line break only holds the last line open, as in any editable text: it is not part of the text.
  if (out.length && out[out.length - 1].node.nodeName === 'BR') out.pop()
  return out
}

export function readField(root: Node): string {
  return leaves(root).map((l) => l.text).join('')
}

/** The chips the field shows now, where they stand in its text. */
export function chipsInField(root: Node): FieldChip[] {
  return leaves(root).flatMap((l) => (isChip(l.node) ? [{ reference: l.text, start: l.start, end: l.start + l.text.length }] : []))
}

/** Whether the field holds only what it draws: text, chips and a last line break — nothing a browser added. */
export function isFlat(root: Node): boolean {
  const children = Array.from(root.childNodes)
  return children.every((c, i) => c.nodeType === 3 || isChip(c) || (c.nodeName === 'BR' && i === children.length - 1))
}

/** The offset in the text of a place in the field; a place inside a chip is the end of the chip. */
export function offsetIn(root: Node, node: Node, offset: number): number {
  const ls = leaves(root)
  const total = ls.reduce((n, l) => n + l.text.length, 0)
  let chip: Node | null = node
  while (chip && chip !== root && !isChip(chip)) chip = chip.parentNode
  if (chip && chip !== root) {
    const l = ls.find((x) => x.node === chip)
    return l ? l.start + l.text.length : total
  }
  if (node.nodeType === 3) {
    const l = ls.find((x) => x.node === node)
    return l ? l.start + Math.min(offset, l.text.length) : total
  }
  const child = node.childNodes[offset]
  const before = child
    ? (n: Node) => !child.contains(n) && Boolean(child.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING)
    : (n: Node) => node.contains(n) || Boolean(node.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING)
  let sum = 0
  for (const l of ls) {
    if (!before(l.node)) break
    sum += l.text.length
  }
  return sum
}

/** The place in the field of an offset in the text; an offset inside a chip is the place after it. */
function pointAt(root: Node, offset: number): [Node, number] {
  let after: [Node, number] | null = null
  for (const l of leaves(root)) {
    const end = l.start + l.text.length
    if (!l.atomic) {
      if (offset <= end) return [l.node, Math.max(0, offset - l.start)]
      after = [l.node, l.text.length]
      continue
    }
    const parent = l.node.parentNode ?? root
    const index = Array.prototype.indexOf.call(parent.childNodes, l.node) as number
    if (offset <= l.start) return [parent, index]
    if (offset < end) return [parent, index + 1]
    after = [parent, index + 1]
  }
  return after ?? [root, 0]
}

/** The selection in the field as offsets in its text, or null when the selection is elsewhere. */
export function selectionIn(root: HTMLElement): [number, number] | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return [offsetIn(root, range.startContainer, range.startOffset), offsetIn(root, range.endContainer, range.endOffset)]
}

export function selectIn(root: HTMLElement, start: number, end: number): void {
  const selection = root.ownerDocument.getSelection()
  if (!selection) return
  const range = root.ownerDocument.createRange()
  range.setStart(...pointAt(root, start))
  range.setEnd(...pointAt(root, end))
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Rewrites the text between the field's chips in place, when the new text has the same chips in the same order: the
 * field stays the same element, so its focus, and a screen reader's place in it, are kept. False when the chips differ.
 */
export function patchText(root: HTMLElement, pieces: FieldPiece[]): boolean {
  if (!isFlat(root)) return false
  const chips = Array.from(root.childNodes).filter(isChip)
  const wanted = chipsOf(pieces)
  if (chips.length !== wanted.length || chips.some((c, i) => c.getAttribute(CHIP_ATTR) !== wanted[i].reference)) return false
  for (const child of Array.from(root.childNodes)) if (!isChip(child)) child.remove()
  const doc = root.ownerDocument
  let i = 0
  for (const p of pieces) {
    if (p.kind === 'chip') i++
    else if (i < chips.length) root.insertBefore(doc.createTextNode(p.text), chips[i])
    else root.appendChild(doc.createTextNode(p.text))
  }
  if (needsEndBreak(pieces)) root.appendChild(doc.createElement('br'))
  return true
}

/** A text ending in a new line, or in a chip, needs a last line break for the caret to have a place after it. */
export function needsEndBreak(pieces: FieldPiece[]): boolean {
  const last = pieces[pieces.length - 1]
  return last !== undefined && (last.kind === 'chip' || last.text.endsWith('\n'))
}

/** The text with `insert` in place of `[start, end)`, and the caret after it. */
export function withInserted(text: string, [start, end]: [number, number], insert: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length }
}

/** What Mention makes of the text: the reference at the caret, a space either side unless one is there, the caret after it. */
export function withMention(text: string, [start, end]: [number, number], reference: string): { text: string; caret: number } {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const trail = /^\s/.test(after) ? '' : ' '
  const insert = `${lead}${reference}${trail}`
  return { text: before + insert + after, caret: start + insert.length + (trail ? 0 : 1) }
}
