import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Logomark, Wordmark } from '@agenthix/ui'
import { useNavDrawer } from '../context/NavDrawerContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { ShellPanelButtons } from '../layouts/ShellPanelButtons'
import type { PlaceNav } from '../layouts/placeNavTypes'
import { BRANDING } from '@agenthix/core'
import { MainNavList } from './sidebar/mainNav'
import type { PinnedSlot } from './sidebar/pinnedSlot'
import { SidebarFooter } from './sidebar/SidebarFooter'
import { BackButton, CollapsedPlaceHead, PlacePanelHeader, PlaceSections } from './sidebar/PlacePanel'
import { MainNavOverlay } from './sidebar/MainNavOverlay'
import { OrgSwitcher } from './sidebar/OrgSwitcher'
import { withConversation } from '../../dock/dockAddress'

export type { PinnedSlotState } from './sidebar/pinnedSlot'

interface AppSidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** The Pinned row in the foot; it is passed in, the foot places it. */
  pinned?: PinnedSlot
  /** The place the panel is drilled into (inside a project, your space or an agent's page); none shows the main navigation. */
  placeNav?: PlaceNav | null
}

export function AppSidebar({ collapsed: collapsedSetting = false, onToggleCollapse, pinned, placeNav = null }: AppSidebarProps) {
  const { pathname, search } = useLocation()
  const { open, closeDrawer } = useNavDrawer()
  const isMobile = useIsMobile()
  // The drawer on a small screen is always the full navigation.
  const collapsed = collapsedSetting && !isMobile
  const [mainOpen, setMainOpen] = useState(false)
  const back = useRef<HTMLButtonElement>(null)

  // Going anywhere, or the drawer closing, puts the main navigation away. The conversation beside the page opening
  // or changing is not going anywhere: the dock fills itself in moments after a page loads.
  const page = withConversation({ pathname, search }, null)
  useEffect(() => { setMainOpen(false) }, [page, placeNav?.homePath])
  useEffect(() => { if (!open && isMobile) setMainOpen(false) }, [open, isMobile])

  const dismiss = useCallback(() => {
    setMainOpen(false)
    back.current?.focus()
  }, [])
  const outside = useCallback(() => {
    dismiss()
    if (isMobile) closeDrawer()
  }, [dismiss, isMobile, closeDrawer])

  const backButton = placeNav && (
    <BackButton ref={back} expanded={mainOpen} onClick={() => setMainOpen(true)} className={collapsed ? 'w-10 h-10' : 'p-1.5'} />
  )

  return (
    <>
      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 w-60 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:translate-x-0 lg:transition-all ${collapsed ? 'lg:w-[64px]' : 'lg:w-60'} h-full bg-surface-0 border-r border-border-subtle flex flex-col shrink-0 overflow-hidden`}
      >
        <div className={`shrink-0 flex ${collapsed ? 'flex-col items-center gap-2 pt-3 pb-2' : 'items-center gap-1.5 h-14 px-3'}`}>
          <Link to="/" onClick={closeDrawer} aria-label={BRANDING.displayName} className="flex items-center gap-1.5 min-w-0">
            <Logomark className="h-7 w-7 shrink-0 text-accent" />
            {!collapsed && <Wordmark className="h-5 text-text-primary" />}
          </Link>
          <div className={collapsed ? '' : 'ml-auto'}>
            <ShellPanelButtons vertical={collapsed} onOpen={closeDrawer} />
          </div>
        </div>

        <OrgSwitcher collapsed={collapsed} onNavigate={closeDrawer} />

        {placeNav ? (
          <div data-testid="place-panel" className={`flex-1 min-h-0 flex flex-col pt-2 ${collapsed ? 'px-2' : 'px-3'}`}>
            {collapsed ? <CollapsedPlaceHead nav={placeNav} back={backButton} /> : <PlacePanelHeader nav={placeNav} back={backButton} />}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2">
              <PlaceSections nav={placeNav} collapsed={collapsed} onNavigate={closeDrawer} />
            </div>
          </div>
        ) : (
          <div className={`flex-1 overflow-y-auto overflow-x-hidden py-2 ${collapsed ? 'px-2' : 'px-3'} space-y-0.5`}>
            <MainNavList collapsed={collapsed} onNavigate={closeDrawer} />
          </div>
        )}

        <SidebarFooter collapsed={collapsed} onToggleCollapse={onToggleCollapse} onNavigate={closeDrawer} pinned={pinned} />
      </nav>
      {placeNav && mainOpen && (
        <MainNavOverlay homePath={placeNav.homePath} pinned={pinned} onClose={dismiss} onOutside={outside} />
      )}
    </>
  )
}
