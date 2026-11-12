import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router'
import { AppSidebar } from '../components/AppSidebar'
import { useNavDrawer } from '../context/NavDrawerContext'
import { useProjectMenuHidden } from './useProjectMenuHidden'
import { ScreenBar, documentTitle, type Breadcrumb } from './ScreenBar'
import { MobileHeader } from './MobileHeader'
import { ShellPanelHost } from './ShellPanelHost'
import { VoiceBar } from './VoiceBar'
import { PhoneActionsProvider } from './phoneActions'
import { BRANDING } from '@agenthix/core'
import { FrameLine, type FrameLineLink } from '@agenthix/ui/attention'
import type { PlaceNav } from './placeNavTypes'
import { isAdminPath } from '../../admin/adminPaths'
import { AdminSidebar } from '../../admin/components/AdminSidebar'
import { AdminGate } from '../../admin/components/AdminGate'
import { FileViewerHost } from '../../storage/pages/viewer/FileViewerHost'

interface ShellFrameProps {
  children: ReactNode
  /** False while the page shows no shell: only the children are drawn, at the same place in the tree. */
  framed: boolean
  breadcrumbs: Breadcrumb[]
  screenBarRight?: ReactNode
  /** Below `lg`, in place of the standard header. */
  mobileHeader?: ReactNode
  /** The docked conversation, on the right of the screen. Drawn whether framed or not, so it is never remounted. */
  dock?: ReactNode
  /** The conversation is expanded over the screen: the screen stays mounted, out of sight, beside the navigation. */
  screenHidden?: boolean
  /** A medium window (spec §12): a place's menu shows as icons. */
  navIcons?: boolean
  /** The place the screen is in: its menu opens beside the rail. */
  placeNav?: PlaceNav | null
  /** The screen draws its own top bar in place of the screen bar (the workspace view); everything else of the frame stays. */
  ownBar?: boolean
  /** The frame line's words: the state of HQ as a whole (not answering, read-only during a move, the demo), one at a time. */
  frameLine?: ReactNode
  /** A link at the end of the frame line: the demo's to the guide. */
  frameLineLink?: FrameLineLink | null
}

/**
 * The frame every screen shares: the rail on the left (with a place's menu beside it), then the
 * screen — its bar, then its content — and on the right the docked conversation.
 * The Notifications and Runs panels open against the rail, over the project menu and the screen. On a narrow window the frame
 * stacks, so the conversation's pill sits below the screen.
 *
 * Unframed, the two wrappers stay (as `display: contents`) and the frame's parts are
 * left out, so the children keep their place and are never remounted when a page
 * starts or stops showing the shell.
 */
export function ShellFrame({ children, framed, breadcrumbs, screenBarRight, mobileHeader, dock, screenHidden = false, navIcons = false, placeNav = null, ownBar = false, frameLine = null, frameLineLink = null }: ShellFrameProps) {
  const [menuHidden, toggleMenu] = useProjectMenuHidden()
  const { open, closeDrawer } = useNavDrawer()
  const { pathname } = useLocation()
  // The admin area is a second frame: its own menu for the navigation, the page behind a role check, and no docked
  // conversation. The dock stays mounted, out of sight, so an open conversation survives a visit.
  const inAdmin = isAdminPath(pathname)
  const drawn = framed || inAdmin

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  const tabTitle = documentTitle(breadcrumbs)
  useEffect(() => {
    if (!drawn) return
    document.title = tabTitle
    return () => { document.title = documentTitle([]) }
  }, [drawn, tabTitle])

  const mobileTitle = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].label : BRANDING.displayName

  const mainNav = (
    <AppSidebar placeNav={inAdmin ? null : placeNav} menuHidden={menuHidden} onToggleMenu={toggleMenu} menuIcons={navIcons} />
  )

  return (
    <PhoneActionsProvider>
      <div className={drawn ? 'relative flex h-screen w-full bg-surface-0 overflow-hidden max-md:flex-col' : 'contents'}>
        {drawn && open && (
          <div
            data-testid="nav-drawer-backdrop"
            onClick={closeDrawer}
            className="fixed inset-0 z-30 bg-scrim lg:hidden"
          />
        )}

        {drawn && (inAdmin ? <AdminSidebar fallback={mainNav} /> : mainNav)}

        <div
          data-testid="shell-screen"
          className={drawn ? `relative flex-col flex-1 min-w-0 min-h-0 overflow-hidden bg-surface-1 ${screenHidden && !inAdmin ? 'hidden' : 'flex'}` : 'contents'}
        >
          {drawn && (mobileHeader ?? <MobileHeader title={mobileTitle} />)}
          {drawn && !(ownBar && !inAdmin) && <ScreenBar breadcrumbs={breadcrumbs} right={screenBarRight} placeNav={inAdmin ? null : placeNav} menuHidden={menuHidden} onShowMenu={toggleMenu} />}
          {drawn && <VoiceBar />}
          {/* The frame line, under the bar and the call bar: its own row while it shows (none otherwise), so it never covers a control. */}
          {drawn && frameLine && <div data-testid="frame-line-row" className="shrink-0"><FrameLine link={frameLineLink}>{frameLine}</FrameLine></div>}
          {/*
            While the frame line shows, the content and the file viewer start below it: the viewer covers this box, not
            the line. Otherwise the box is `contents` and the viewer covers the whole screen, as it always has. Only the
            class changes, so the screen is never remounted when the line comes or goes.
          */}
          <div data-testid="shell-content" className={drawn && frameLine ? 'relative flex min-h-0 min-w-0 flex-1 flex-col' : 'contents'}>
            {inAdmin ? <AdminGate>{children}</AdminGate> : children}
            {/* Over the screen, between the menu and the chat: a file opened where it was mentioned. */}
            {framed && !inAdmin && <FileViewerHost pageTitle={breadcrumbs.length ? mobileTitle : null} />}
          </div>
          {inAdmin && <ShellPanelHost />}
        </div>
        {/* Against the rail, over the project menu (the Runs panel design), so outside the screen. */}
        {framed && !inAdmin && !screenHidden && <ShellPanelHost againstRail />}
        <div className={inAdmin ? 'hidden' : 'contents'}>{dock}</div>
      </div>
    </PhoneActionsProvider>
  )
}
