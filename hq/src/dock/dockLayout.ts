import type { DockPosition } from './DockContext'
import type { DockWidth } from './useDockWidth'

const EDGE = 'flex flex-col border-l border-border-subtle bg-surface-0'
const RAIL = `${EDGE} w-12 shrink-0`
const EXPANDED = `${EDGE} min-w-0 flex-1`

/**
 * Where the dock's one `<aside>` sits for each width and position (spec §12): only its classes change, so the
 * conversation inside is never remounted. Narrow, the frame stacks (`max-md:flex-col`), so the pill sits below the
 * screen rather than over it.
 */
export function dockClasses(width: DockWidth, position: DockPosition): string {
  if (width === 'narrow') {
    return position === 'collapsed'
      ? 'flex shrink-0 border-t border-border-subtle bg-surface-0 px-3 py-2'
      : 'fixed inset-0 z-40 flex flex-col bg-surface-0'
  }
  if (position === 'collapsed') return RAIL
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
