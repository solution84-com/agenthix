/**
 * Where each reply being revealed has got to: the element of its last revealed character, so the thread can follow the
 * line being revealed. A reply shows its cursor while it is being revealed, and hides it once it is whole and settled.
 */
export type RevealCursor = { element: () => HTMLElement | null }

const cursors = new Set<RevealCursor>()
const listeners = new Set<() => void>()

const told = () => listeners.forEach((l) => l())

export function showCursor(c: RevealCursor): void {
  if (cursors.has(c)) return
  cursors.add(c)
  told()
}

export function hideCursor(c: RevealCursor): void {
  if (cursors.delete(c)) told()
}

/** Called when a reveal starts or ends. */
export function onCursors(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The revealed character furthest down inside `box`, or null when nothing in it is being revealed. */
export function cursorIn(box: Element): HTMLElement | null {
  let best: HTMLElement | null = null
  for (const c of cursors) {
    const el = c.element()
    if (!el || !box.contains(el)) continue
    if (!best || best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = el
  }
  return best
}
