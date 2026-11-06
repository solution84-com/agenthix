import type { DockPosition } from './DockContext'
import type { DockWidth } from './useDockWidth'

// The panel, then its bar on the right; minimised, the bar alone.
const EDGE = 'flex flex-row border-l border-border-subtle bg-surface-0'
const BAR_ONLY = `${EDGE} w-14 shrink-0`
const EXPANDED = `${EDGE} min-w-0 flex-1`

/**
 * Where the dock's one `<aside>` sits for each width and position (spec §12): only its classes change, so the
 * conversation inside is never remounted. Narrow, it is full screen or folded away out of sight: the chat's icon in
 * the top bar opens it again.
 */
export function dockClasses(width: DockWidth, position: DockPosition): string {
  if (width === 'narrow') {
    return position === 'collapsed' ? 'hidden' : 'fixed inset-0 z-40 flex flex-col bg-surface-0'
  }
  if (position === 'collapsed') return BAR_ONLY
  if (position === 'expanded') return EXPANDED
  return width === 'wide'
    ? `${EDGE} relative shrink-0`
    : `${EDGE} fixed inset-y-0 right-0 z-20 max-w-full shadow-pop`
}

/** Whether the dock is beside or over the canvas, where its width can be dragged. */
export function resizable(width: DockWidth, position: DockPosition): boolean {
  return width !== 'narrow' && position === 'docked'
}

/** Whether the canvas is out of sight behind the dock, so it can be left out of the layout while it stays mounted. */
export function screenCovered(width: DockWidth, position: DockPosition): boolean {
  return width !== 'narrow' && position === 'expanded'
}
