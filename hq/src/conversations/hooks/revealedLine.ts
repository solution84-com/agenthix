/**
 * The line a reveal is on, measured on screen: its bottom (the line box's, not just the glyphs'), the bottom of the
 * line before it (in the block before, across the space between blocks, when it is a block's first line), where its
 * text starts and ends, and where the reveal has got to along it. Where the line will end is known once text is laid out
 * after it, or once the reply is laid out whole (`data-whole` on its text, ReplyBody); until then the line may still
 * grow, and it is taken to run to its block's edge, so the point followed along it never moves back.
 */
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre'

/** The first element drawn next to `block` inside the reply's text `root`, after it or before it. */
function drawnBeside(block: Element, root: Element | null, after: boolean): Element | null {
  for (let n: Element | null = block; n && n !== root; n = n.parentElement) {
    for (let next = after ? n.nextElementSibling : n.previousElementSibling; next; next = after ? next.nextElementSibling : next.previousElementSibling) {
      if (next.getBoundingClientRect().height > 0) return next
    }
  }
  return null
}

export type RevealedLine = { bottom: number; from: number; left: number; right: number; at: number }

export function lineAt(cursor: HTMLElement, fallbackHeight: number): RevealedLine {
  const r = cursor.getBoundingClientRect()
  const lh = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(cursor).lineHeight) : NaN
  const height = Number.isFinite(lh) && lh > 0 ? lh : fallbackHeight
  const half = Math.max(0, (height - r.height) / 2)
  const top = r.top - half
  const bottom = r.bottom + half
  const plain = { bottom, from: top, left: 0, right: 0, at: r.right }
  const block = cursor.closest(BLOCKS) ?? cursor.parentElement
  if (!block || typeof document.createRange !== 'function') return plain
  const range = document.createRange()
  if (typeof range.getClientRects !== 'function') return plain
  range.selectNodeContents(block)
  let left = Infinity, end = -Infinity, below = false, above = false
  for (const q of Array.from(range.getClientRects())) {
    if (q.width <= 0 && q.height <= 0) continue
    if (q.top >= bottom - 1) below = true
    else if (q.bottom <= top + 1) above = true
    else { left = Math.min(left, q.left); end = Math.max(end, q.right) }
  }
  if (!Number.isFinite(left)) return plain
  const root = cursor.closest('[data-reply-text]')
  const known = below || root?.hasAttribute('data-whole') || !!drawnBeside(block, root, true)
  // A block's first line starts from the bottom of the block before it, so crossing the space between them is no jump.
  const before = above ? null : drawnBeside(block, root, false)?.getBoundingClientRect().bottom
  const from = before !== undefined && before !== null && before < top ? before : top
  const edge = block.getBoundingClientRect().right
  return { bottom, from, left, right: known ? end : Math.max(end, edge), at: r.right }
}
