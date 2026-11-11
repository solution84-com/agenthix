import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useQuery, getOrgIdentity } from 'wasp/client/operations'
import { useNavDrawer } from '../../shared/context/NavDrawerContext'
import { NavItem } from '../../shared/components/sidebar/NavItem'
import { useOrgAdminState } from '../useOrgAdminState'
import { ADMIN_MENU, entryActive, type AdminMenuGroup } from '../adminMenu'
import { FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'

function Group({ group, pathname, onNavigate }: { group: AdminMenuGroup; pathname: string; onNavigate: () => void }) {
  const [only] = group.entries
  if (group.entries.length === 1 && only.label === group.heading) {
    return <NavItem to={only.to} label={only.label} icon={group.icon} active={entryActive(only, pathname)} collapsed={false} onClick={onNavigate} />
  }
  return (
    <div className="pt-3">
      <h2 className="px-2 pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">{group.heading}</h2>
      {group.entries.map(e => {
        const active = entryActive(e, pathname)
        return (
          <Link
            key={e.to}
            to={e.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`block rounded-lg px-2 py-1.5 text-body ${FOCUS_RING_INSET} ${active ? ROW_CHOSEN : ROW_ITEM}`}
          >
            {e.label}
          </Link>
        )
      })}
    </div>
  )
}

/**
 * The admin area's menu, where the main navigation is: Back to the organisation, then the groups of what an admin
 * manages. Someone who is not an admin reaches no menu; `fallback` (the main navigation) is drawn for them instead,
 * beside the page that tells them who to ask.
 */
export function AdminSidebar({ fallback }: { fallback: ReactNode }) {
  const state = useOrgAdminState()
  const { data: org } = useQuery(getOrgIdentity)
  const { open, closeDrawer } = useNavDrawer()
  const { pathname } = useLocation()
  if (state !== 'admin') return <>{fallback}</>
  const name = org?.name ?? 'the organisation'
  return (
    <nav
      aria-label="Admin"
      data-testid="admin-menu"
      className={`fixed inset-y-0 left-0 z-40 flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface-0 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:translate-x-0 lg:transition-all`}
    >
      <div className="shrink-0 border-b border-border-subtle px-3 py-3">
        <Link to="/org" onClick={closeDrawer} className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-small text-text-secondary hover:text-text-primary">
          <ArrowLeft size={14} aria-hidden />Back to {name}
        </Link>
        <div className="mt-2 px-1">
          <div className="truncate text-h3 font-medium text-text-primary">{name}</div>
          <div className="text-micro font-medium uppercase tracking-wide text-text-muted">Admin</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
        {ADMIN_MENU.map(g => <Group key={g.heading} group={g} pathname={pathname} onNavigate={closeDrawer} />)}
      </div>
    </nav>
  )
}
