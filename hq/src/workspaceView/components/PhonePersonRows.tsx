import { Activity, Bell } from 'lucide-react'
import { MainNavLink, footLinks } from '../../shared/components/sidebar/mainNav'
import { YouMenu } from '../../shared/components/sidebar/YouMenu'
import { useSignedInPerson } from '../../shared/components/sidebar/useSignedInPerson'
import { useShellPanels } from '../../shared/context/useShellPanels'
import { formatCount, useShellCounts } from '../../shared/layouts/useShellCounts'

/** The rail's foot on a phone, after the ⋮ sheet's own items: the person's menu, Manage (admins), Runs, Notifications. */
export function PhonePersonRows({ rowClass, onDone }: { rowClass: string; onDone: () => void }) {
  const { username, isAdmin } = useSignedInPerson()
  const { toggleNotifications, toggleRuns } = useShellPanels()
  const { unreadNotifications, runsInProgress } = useShellCounts()
  return (
    <div data-testid="phone-person-rows" className="mt-2 border-t border-border-subtle pt-2">
      <YouMenu username={username} rail={false} onNavigate={onDone} />
      {footLinks(isAdmin).map(l => <MainNavLink key={l.to} link={l} rail={false} onNavigate={onDone} />)}
      <button type="button" className={rowClass} onClick={() => { onDone(); toggleRuns() }}>
        <Activity size={16} aria-hidden className="shrink-0 text-text-muted" />
        <span className="flex-1">Runs</span>
        {runsInProgress > 0 && <span className="text-small text-text-muted">{formatCount(runsInProgress)} in progress</span>}
      </button>
      <button type="button" className={rowClass} onClick={() => { onDone(); toggleNotifications() }}>
        <Bell size={16} aria-hidden className="shrink-0 text-text-muted" />
        <span className="flex-1">Notifications</span>
        {unreadNotifications > 0 && <span className="text-small text-text-muted">{formatCount(unreadNotifications)}</span>}
      </button>
    </div>
  )
}
