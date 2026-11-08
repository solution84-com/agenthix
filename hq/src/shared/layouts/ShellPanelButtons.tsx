import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Tooltip } from '@agenthix/ui/primitives'
import { Bell, Activity } from 'lucide-react'
import { useShellPanels } from '../context/useShellPanels'
import { useShellCounts } from './useShellCounts'
import { formatCount, runsWords } from './shellCountWords'
import { DRAWER_ROW, drawerRowState } from '../components/sidebar/mainNav'

const onRunsPage = (pathname: string) => pathname === '/runs' || pathname.startsWith('/runs/')

/**
 * Notifications and Runs in the rail's foot, stacked. They sit together because they behave alike: each opens its
 * panel beside the navigation and carries a count. Runs' badge counts what needs the person; its tooltip says what is
 * running. Runs is not one of the places, so on the Runs page its icon is the one highlighted.
 */
export function ShellPanelButtons() {
  const { activePanel, toggleNotifications, toggleRuns } = useShellPanels()
  const counts = useShellCounts()
  const { pathname } = useLocation()
  const runs = runsWords(counts)
  const runsName = ['Runs', runs.needs, runs.running].filter(Boolean).join(', ')

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <PanelButton
        label="Notifications"
        name={counts.unreadNotifications > 0 ? `Notifications, ${counts.unreadNotifications} need you` : 'Notifications'}
        tooltip="Notifications"
        badge={counts.unreadNotifications}
        badgeClass="bg-danger"
        active={activePanel === 'notifications'}
        onClick={toggleNotifications}
      >
        <Bell size={18} />
      </PanelButton>
      <PanelButton
        label="Runs"
        name={runsName}
        tooltip={runs.running ? `Runs · ${runs.running}` : 'Runs'}
        badge={counts.runsNeedingYou}
        badgeClass="bg-warning"
        active={activePanel === 'runs' || (activePanel === null && onRunsPage(pathname))}
        onClick={toggleRuns}
      >
        <Activity size={18} />
      </PanelButton>
    </div>
  )
}

function PanelButton({ label, name, tooltip, badge, badgeClass, active, onClick, children }: {
  label: string
  name: string
  tooltip: string
  badge: number
  badgeClass: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip label={tooltip}>
      <button
        type="button"
        onClick={onClick}
        aria-label={name}
        aria-pressed={active}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-selected text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        {children}
        {badge > 0 && (
          <span
            data-testid={`${label.toLowerCase()}-count`}
            className={`absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-micro font-semibold leading-none text-surface-0 ${badgeClass}`}
          >
            {formatCount(badge)}
          </span>
        )}
      </button>
    </Tooltip>
  )
}

/**
 * Notifications and Runs as rows in the phone drawer's foot (they are not in the top bar), their counts in words:
 * "3 need you"; "2 need you · 3 running". Choosing one closes the drawer and opens its panel.
 */
export function ShellPanelRows({ onOpen }: { onOpen: () => void }) {
  const { activePanel, toggleNotifications, toggleRuns } = useShellPanels()
  const counts = useShellCounts()
  const runs = runsWords(counts)
  const notes = counts.unreadNotifications > 0 ? `${formatCount(counts.unreadNotifications)} need you` : null
  return (
    <>
      <button type="button" aria-pressed={activePanel === 'notifications'} onClick={() => { onOpen(); toggleNotifications() }} className={`${DRAWER_ROW} ${drawerRowState(false)}`}>
        <Bell size={18} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">Notifications</span>
        {notes && <span className="shrink-0 text-small font-medium text-warning">{notes}</span>}
      </button>
      <button type="button" aria-pressed={activePanel === 'runs'} onClick={() => { onOpen(); toggleRuns() }} className={`${DRAWER_ROW} ${drawerRowState(false)}`}>
        <Activity size={18} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">Runs</span>
        {(runs.needs || runs.running) && (
          <span className="shrink-0 text-small text-text-muted">
            {runs.needs && <span className="font-medium text-warning">{runs.needs}</span>}
            {runs.needs && runs.running && ' · '}
            {runs.running}
          </span>
        )}
      </button>
    </>
  )
}
