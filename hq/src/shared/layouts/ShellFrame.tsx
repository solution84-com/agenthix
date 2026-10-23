import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router'
import { AppSidebar } from '../components/AppSidebar'
import { PinnedFoot } from '../../pins/components/PinnedFoot'
import { useNavDrawer } from '../context/NavDrawerContext'
import { useNavCollapsed } from '../context/useNavCollapsed'
import { ScreenBar, documentTitle, type Breadcrumb } from './ScreenBar'
import { MobileHeader } from './MobileHeader'
import { ShellPanelHost } from './ShellPanelHost'
import { ShellNotices } from './ShellNotices'
import { VoiceBar } from './VoiceBar'
import { BRANDING } from '@agenthix/core'
import type { PlaceNav } from './placeNavTypes'
import { isAdminPath } from '../../admin/adminPaths'
import { AdminSidebar } from '../../admin/components/AdminSidebar'
import { AdminGate } from '../../admin/components/AdminGate'

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
  /** A medium window (spec §12): the navigation shows as icons, whatever the person's own setting. */
  navIcons?: boolean
  /** The place the left panel is drilled into. */
  placeNav?: PlaceNav | null
}

/**
 * The frame every screen shares: the navigation on the left, beside it the
 * screen — its bar, then its content — and on the right the docked conversation.
 * The Notifications and Runs panels open over the screen, against the navigation. On a narrow window the frame
 * stacks, so the conversation's pill sits below the screen.
 *
 * Unframed, the two wrappers stay (as `display: contents`) and the frame's parts are
 * left out, so the children keep their place and are never remounted when a page
 * starts or stops showing the shell.
 */
export function ShellFrame({ children, framed, breadcrumbs, screenBarRight, mobileHeader, dock, screenHidden = false, navIcons = false, placeNav = null }: ShellFrameProps) {
  const [collapsed, toggleCollapsed] = useNavCollapsed()
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
    <AppSidebar
      collapsed={collapsed || navIcons}
      onToggleCollapse={navIcons ? undefined : toggleCollapsed}
      pinned={(s) => <PinnedFoot {...s} />}
      placeNav={inAdmin ? null : placeNav}
    />
  )

  return (
    <div className={drawn ? 'flex h-screen w-full bg-surface-0 overflow-hidden max-md:flex-col' : 'contents'}>
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
        {drawn && <ScreenBar breadcrumbs={breadcrumbs} right={screenBarRight} placeNav={placeNav} />}
        {drawn && <ShellNotices />}
        {drawn && <VoiceBar />}
        {inAdmin ? <AdminGate>{children}</AdminGate> : children}
        {drawn && <ShellPanelHost />}
      </div>
      <div className={inAdmin ? 'hidden' : 'contents'}>{dock}</div>
    </div>
  )
}
