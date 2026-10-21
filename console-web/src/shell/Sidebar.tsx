import { useState } from 'react'
import { Building2, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { SessionUser } from '../api/session'
import { Brand, WhereBadge } from './Brand'
import { storeCollapsed, storedCollapsed } from './collapse'
import { DASHBOARD, isAt, type MenuHq, type MenuItem, type MenuSite } from './menu'
import { MenuEntry } from './MenuEntry'
import { NoticesBell } from './NoticesBell'
import { OrgSwitcher } from './OrgSwitcher'
import { PersonMenu } from './PersonMenu'
import { SitesMenu } from './SitesMenu'

export interface SidebarProps {
  jobs: readonly MenuItem[]
  hq: MenuHq
  sites: MenuSite[]
  path: string
  machineName: string | null
  /** Notices not dismissed: the bell's count. */
  noticeCount: number
  user: SessionUser
  onSignOut: () => void
}

/** The menu in three parts: Dashboard and HQ fixed at the top, the sites scrolling in the middle, the jobs pinned below. */
export function Sidebar({ jobs, hq, sites, path, machineName, noticeCount, user, onSignOut }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(storedCollapsed)
  const fold = () => { storeCollapsed(!collapsed); setCollapsed(!collapsed) }
  const FoldIcon = collapsed ? ChevronsRight : ChevronsLeft
  const hqTo = hq.to ?? DASHBOARD.path

  return (
    <nav
      aria-label="Fleet Console"
      className={`flex min-h-0 flex-none flex-col gap-0.5 border-r border-border-subtle bg-frame-sidebar pt-4 pb-3 ${collapsed ? 'w-14 items-center px-2' : 'w-[204px] px-3'}`}
    >
      <div className={`flex flex-col gap-[7px] pb-4 ${collapsed ? 'items-center' : 'px-1.5'}`}>
        <div className="flex items-center self-stretch">
          <Brand collapsed={collapsed} />
          {!collapsed && <span className="ml-auto"><NoticesBell count={noticeCount} /></span>}
        </div>
        {collapsed ? <NoticesBell count={noticeCount} /> : <WhereBadge machineName={machineName} />}
        <OrgSwitcher collapsed={collapsed} />
      </div>

      <MenuEntry to={DASHBOARD.path} label={DASHBOARD.label} icon={DASHBOARD.icon} current={isAt(DASHBOARD.path, path)} collapsed={collapsed} />
      <MenuEntry to={hqTo} label="HQ" icon={Building2} current={hq.to !== null && isAt(hq.to, path)} collapsed={collapsed} state={{ dot: hq.dot, words: hq.state }} />

      <SitesMenu sites={sites} path={path} collapsed={collapsed} />

      <div className={`-mx-1 mt-1 flex flex-none flex-col gap-0.5 border-t border-border-subtle px-1 pt-2 ${collapsed ? 'items-center' : ''}`}>
        {jobs.map(item => (
          <MenuEntry key={item.path} to={item.path} label={item.label} icon={item.icon} current={isAt(item.path, path)} collapsed={collapsed} />
        ))}
        <button
          type="button"
          onClick={fold}
          aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
          title={collapsed ? 'Expand' : undefined}
          className={`flex items-center gap-2.5 rounded-lg py-[7px] text-[12.5px] text-text-muted hover:bg-surface-hover ${collapsed ? 'w-[38px] justify-center' : 'px-[9px]'}`}
        >
          <FoldIcon size={16} aria-hidden className="flex-none" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      <PersonMenu user={user} onSignOut={onSignOut} collapsed={collapsed} current={path === '/account'} />
    </nav>
  )
}
