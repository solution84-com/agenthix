import { useNavDrawer } from '../context/NavDrawerContext'
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
 * The app's main navigation, which never goes away. On a wide screen a slim rail: the organisation, the places
 * (icons, each named by a tooltip), a divider, then Manage, notifications and you; a place's menu opens beside it. Below
 * `lg` it is the main drawer, from ☰: the same items as rows, and never a place's menu.
 */
export function AppSidebar({ placeNav = null, menuHidden = false, onToggleMenu = () => {}, menuIcons = false }: AppSidebarProps) {
  const { open, closeDrawer } = useNavDrawer()
  const rail = !useIsMobile()

  return (
    <>
      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 w-60 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:translate-x-0 lg:w-14 h-full bg-surface-0 border-r border-border-subtle flex flex-col shrink-0 overflow-hidden`}
      >
        <div className="shrink-0 pt-3 pb-1">
          <OrgSwitcher collapsed={rail} onNavigate={closeDrawer} />
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 ${rail ? 'flex flex-col items-center gap-2 px-2' : 'px-3 space-y-0.5'}`}>
          <MainNavList rail={rail} onNavigate={closeDrawer} />
        </div>
        <SidebarFooter rail={rail} onNavigate={closeDrawer} />
      </nav>
      {rail && placeNav && !menuHidden && <ProjectMenu nav={placeNav} icons={menuIcons} onHide={onToggleMenu} />}
    </>
  )
}
