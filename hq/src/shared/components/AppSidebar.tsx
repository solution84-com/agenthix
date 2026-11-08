import { X } from 'lucide-react'
import { useNavDrawer } from '../context/NavDrawerContext'
import { TOP_BAR_BUTTON } from '../layouts/TopBar'
import { useIsMobile } from '../hooks/useIsMobile'
import type { PlaceNav } from '../layouts/placeNavTypes'
import { MainNavList } from './sidebar/mainNav'
import { SidebarFooter } from './sidebar/SidebarFooter'
import { OrgSwitcher } from './sidebar/OrgSwitcher'
import { ProjectMenu } from './sidebar/ProjectMenu'

interface AppSidebarProps {
  /** The place the screen is in (a project, your space or an agent's page): its menu opens beside the rail. */
  placeNav?: PlaceNav | null
  /** The place's menu is hidden: the breadcrumb's show icon brings it back. */
  menuHidden?: boolean
  onToggleMenu?: () => void
  /** A medium window: the place's menu shows as icons. */
  menuIcons?: boolean
}

/**
 * The app's main navigation, which never goes away. On a wide screen a slim rail: the organisation, the eleven places in
 * three groups (icons, each named by a tooltip), then the foot: Manage, Notifications, Runs and you; a place's menu opens
 * beside it. Below `lg` it is the menu (☰) drawer, 300 px from the left over a scrim: the organisation with ✕, the same
 * places as rows in the same groups, and the foot with Notifications and Runs as rows; never a place's menu.
 */
export function AppSidebar({ placeNav = null, menuHidden = false, onToggleMenu = () => {}, menuIcons = false }: AppSidebarProps) {
  const { open, closeDrawer } = useNavDrawer()
  const rail = !useIsMobile()

  return (
    <>
      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 w-[300px] max-w-[85vw] shadow-pop transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:translate-x-0 lg:w-14 lg:shadow-none h-full bg-surface-0 border-r border-border-subtle flex flex-col shrink-0 overflow-hidden`}
      >
        {rail ? (
          <div className="shrink-0 pt-3 pb-1">
            <OrgSwitcher collapsed onNavigate={closeDrawer} />
          </div>
        ) : (
          <div className="flex h-14 shrink-0 items-center gap-1 pr-1">
            <div className="min-w-0 flex-1"><OrgSwitcher collapsed={false} onNavigate={closeDrawer} /></div>
            <button type="button" onClick={closeDrawer} aria-label="Close the menu" className={TOP_BAR_BUTTON}><X size={18} /></button>
          </div>
        )}
        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${rail ? 'flex flex-col items-center gap-2 p-2' : 'flex flex-col px-2'}`}>
          <MainNavList rail={rail} onNavigate={closeDrawer} />
        </div>
        <SidebarFooter rail={rail} onNavigate={closeDrawer} />
      </nav>
      {rail && placeNav && !menuHidden && <ProjectMenu nav={placeNav} icons={menuIcons} onHide={onToggleMenu} />}
    </>
  )
}
