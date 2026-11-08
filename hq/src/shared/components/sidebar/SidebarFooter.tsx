import { ShellPanelButtons, ShellPanelRows } from '../../layouts/ShellPanelButtons'
import { MainNavLink, footLinks } from './mainNav'
import { YouMenu } from './YouMenu'
import { useSignedInPerson } from './useSignedInPerson'

/**
 * The foot, below the places and never moving: Manage for organisation admins, then Notifications and Runs, then you.
 * In the rail Notifications and Runs are icons with badges; in the phone's drawer they are rows, their counts in words.
 */
export function SidebarFooter({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { username, isAdmin } = useSignedInPerson()

  return (
    <div data-testid="sidebar-foot" className={`shrink-0 border-t border-border-subtle flex flex-col ${rail ? 'items-center gap-2 p-2' : 'px-2 pt-1.5 pb-2.5'}`}>
      {footLinks(isAdmin).map((l) => <MainNavLink key={l.to} link={l} rail={rail} onNavigate={onNavigate} />)}
      {rail ? <ShellPanelButtons /> : <ShellPanelRows onOpen={() => onNavigate?.()} />}
      <YouMenu username={username} rail={rail} onNavigate={onNavigate} />
    </div>
  )
}
