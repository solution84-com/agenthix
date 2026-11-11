import { useCallback, useRef } from 'react'
import type { PanelPlacement } from '../conversations/components/ConversationMenu'
import { useDock, type DockPosition, type DockValue } from './DockContext'

export const OVER_REFUSED = 'Close the file to put the chat over the page.'

/** Where the panel opens again: where the person left it, but never over a file or on a phone, where it can't be over. */
export function reopenPosition(left: DockPosition, dock: Pick<DockValue, 'width' | 'besideFile'>): DockPosition {
  return left === 'expanded' && dock.width !== 'narrow' && !dock.besideFile ? 'expanded' : 'docked'
}

/**
 * The bar's button and ⌘J: minimise the panel, or open it again where the person left it, beside or over the page.
 * Null while there is no panel to move.
 */
export function usePanelToggle(dock: DockValue | null): () => void {
  const latest = useRef(dock)
  latest.current = dock
  const left = useRef<DockPosition>('docked')
  if (dock && dock.position !== 'collapsed') left.current = dock.position
  return useCallback(() => {
    const current = latest.current
    if (!current) return
    current.setPosition(current.position === 'collapsed' ? reopenPosition(left.current, current) : 'collapsed')
  }, [])
}

/**
 * The conversation menu's placement entry: where the conversation is in the chat panel, undefined elsewhere (a page
 * with no panel, and a phone, where the panel is already the whole screen).
 */
export function usePanelPlacement(): PanelPlacement | undefined {
  const dock = useDock()
  if (!dock || dock.width === 'narrow') return undefined
  const over = dock.position === 'expanded'
  return {
    over,
    refused: dock.besideFile ? OVER_REFUSED : null,
    onToggle: () => dock.setPosition(over ? 'docked' : 'expanded'),
  }
}
