import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ViewHeaderContext, type ViewHeaderSlot } from '@agenthix/ui/primitives'
import { ToolPanelBoundary } from '../toolPanelContext'

/**
 * A tool's section, across the canvas. The panel names it, so it has no header of its own; a view inside the tool
 * that draws one (`ViewHeaderRow`: back to its parent, its title, its action) draws it across the top.
 */
export function PlaceToolView({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const claim = useCallback(() => () => {}, [])
  const slot = useMemo<ViewHeaderSlot>(() => ({ element, claim }), [element, claim])

  return (
    <>
      <div ref={setElement} className="shrink-0 empty:hidden" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="open-tool">
        <ViewHeaderContext.Provider value={slot}>
          <ToolPanelBoundary>{children}</ToolPanelBoundary>
        </ViewHeaderContext.Provider>
      </div>
    </>
  )
}
