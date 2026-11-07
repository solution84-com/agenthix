import { ShellPanelButtons } from '../../layouts/ShellPanelButtons'
import { MainNavLink, footLinks } from './mainNav'
import { YouMenu } from './YouMenu'
import { useSignedInPerson } from './useSignedInPerson'

/**
 * The rail's foot, below the places' divider and never moving: Manage for organisation admins, then notifications
 * (and Runs) in the rail, then you. In the phone's drawer notifications are in the top bar instead.
 */
export function SidebarFooter({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { username, isAdmin } = useSignedInPerson()

  return (
    <div data-testid="sidebar-foot" className={`shrink-0 border-t border-border-subtle py-2 flex flex-col gap-1 ${rail ? 'items-center px-2' : 'px-3'}`}>
      {footLinks(isAdmin).map((l) => <MainNavLink key={l.to} link={l} rail={rail} onNavigate={onNavigate} />)}
      {rail && <ShellPanelButtons vertical />}
      <YouMenu username={username} rail={rail} onNavigate={onNavigate} />
    </div>
  )
}
