import { useAuth } from 'wasp/client/auth'
import { useQuery, getUserSettings } from 'wasp/client/operations'
import { ShellPanelButtons } from '../../layouts/ShellPanelButtons'
import { MainNavLink, footLinks } from './mainNav'
import { YouMenu } from './YouMenu'

/**
 * The rail's foot, below the places' divider and never moving: Manage for organisation admins, then notifications
 * (and Runs) in the rail, then you. In the phone's drawer notifications are in the top bar instead.
 */
export function SidebarFooter({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { data: user } = useAuth()
  const { data: settings } = useQuery(getUserSettings)
  // The auth identity type does not expose the username identity's shape.
  const username: string = (user as any)?.identities?.username?.id ?? 'admin'
  const isAdmin = (settings as { role?: string } | undefined)?.role === 'ADMIN'

  return (
    <div data-testid="sidebar-foot" className={`shrink-0 border-t border-border-subtle py-2 flex flex-col gap-1 ${rail ? 'items-center px-2' : 'px-3'}`}>
      {footLinks(isAdmin).map((l) => <MainNavLink key={l.to} link={l} rail={rail} onNavigate={onNavigate} />)}
      {rail && <ShellPanelButtons vertical />}
      <YouMenu username={username} rail={rail} onNavigate={onNavigate} />
    </div>
  )
}
