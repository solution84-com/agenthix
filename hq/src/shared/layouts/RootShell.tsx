import { type ReactNode, useCallback, useMemo, useState } from 'react'
import {
  ShellPublisherContext, ShellSlotsContext, sameParts, type ShellParts, type ShellPublisher,
} from '../context/ShellContext'
import { MobileHeader } from './MobileHeader'
import { ShellFrame } from './ShellFrame'
import { BRANDING } from '@agenthix/core'
import { ReadNudgesHeld, ToastHost } from '@agenthix/ui/attention'
import { NO_FRAME_LINE, type FrameLineState } from './useFrameLine'
import { ShellNotices } from './ShellNotices'
import { DockContext, dockShown } from '../../dock/DockContext'
import { screenCovered } from '../../dock/dockLayout'
import { Dock } from '../../dock/Dock'
import { DockGuard } from '../../dock/DockGuard'
import { useOpenConversation } from '../../dock/useOpenConversation'

interface Published extends ShellParts {
  id: string
}

/**
 * The shell drawn once, in the app's root, around the routes: navigating between
 * pages never unmounts it. A page's `AppShell` publishes its breadcrumbs and says
 * whether it brings its own mobile header; the bar's right-hand slot and that header
 * are portalled in by the page, so they keep the page's own context. While no page
 * has published, nothing but the page is drawn.
 *
 * It also holds the open conversation and draws the dock (spec §1–§3): the conversation stays mounted, beside
 * whatever the canvas shows, until the person changes it.
 */
export function RootShell({ children, dataRouter = false }: {
  children: ReactNode
  /** Under a data router (Wasp's is one), which alone can stop a navigation: `DockGuard` is drawn. */
  dataRouter?: boolean
}) {
  const [published, setPublished] = useState<Published[]>([])
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  const dock = useOpenConversation()
  const [frame, setFrame] = useState<FrameLineState>(NO_FRAME_LINE)

  const publish = useCallback((id: string, parts: ShellParts) => {
    setPublished((prev) => {
      const at = prev.findIndex((p) => p.id === id)
      if (at === -1) return [...prev, { id, ...parts }]
      if (sameParts(prev[at], parts)) return prev
      return prev.map((p, i) => (i === at ? { id, ...parts } : p))
    })
  }, [])
  const unpublish = useCallback((id: string) => {
    setPublished((prev) => (prev.some((p) => p.id === id) ? prev.filter((p) => p.id !== id) : prev))
  }, [])
  const publisher = useMemo<ShellPublisher>(() => ({ publish, unpublish }), [publish, unpublish])

  const active = published.length ? published[published.length - 1] : null
  const slots = useMemo(
    () => ({ activeId: active?.id ?? null, screenBarRight: barSlot, mobileHeader: headerSlot }),
    [active?.id, barSlot, headerSlot],
  )
  const breadcrumbs = active?.breadcrumbs ?? []
  const mobileTitle = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].label : BRANDING.displayName

  return (
    <ShellPublisherContext.Provider value={publisher}>
      <ShellSlotsContext.Provider value={slots}>
        <DockContext.Provider value={dock}>
          {dataRouter && <DockGuard />}
          <ShellNotices onChange={setFrame} />
          {/* While the frame line says HQ is not answering, each screen's own "could not be read" is held back. */}
          <ReadNudgesHeld.Provider value={frame.holdReadNudges}>
          <ShellFrame
            framed={active !== null}
            frameLine={frame.words}
            frameLineLink={frame.link ?? null}
            dock={<Dock framed={active !== null} />}
            screenHidden={dockShown(dock) && screenCovered(dock.width, dock.position)}
            navIcons={dock.width === 'medium'}
            breadcrumbs={breadcrumbs}
            placeNav={active?.placeNav ?? null}
            ownBar={active?.ownBar ?? false}
            screenBarRight={<div ref={setBarSlot} className="contents" />}
            mobileHeader={
              <>
                {!active?.ownMobileHeader && <MobileHeader title={mobileTitle} />}
                <div ref={setHeaderSlot} className="contents" />
              </>
            }
          >
            {children}
          </ShellFrame>
          </ReadNudgesHeld.Provider>
          {/* Lifted above a conversation's message box, so a toast never covers it. */}
          <ToastHost />
        </DockContext.Provider>
      </ShellSlotsContext.Provider>
    </ShellPublisherContext.Provider>
  )
}
