import type { ReactNode } from 'react'
import { Bell, Activity } from 'lucide-react'
import { useShellPanels } from '../context/useShellPanels'
import { useShellCounts, formatCount } from './useShellCounts'

/**
 * Notifications and Runs, side by side (or stacked in the collapsed navigation).
 * They sit together because they behave alike: each opens its panel beside the
 * navigation and carries a count.
 */
export function ShellPanelButtons({ vertical = false, onOpen }: { vertical?: boolean; onOpen?: () => void }) {
  const { activePanel, toggleNotifications, toggleRuns } = useShellPanels()
  const { unreadNotifications, runsInProgress } = useShellCounts()

  return (
    <div className={`flex ${vertical ? 'flex-col items-center' : 'items-center'} gap-1 shrink-0`}>
      <PanelButton
        label="Notifications"
        count={unreadNotifications}
        countLabel="need you"
        badgeClass="bg-danger"
        active={activePanel === 'notifications'}
        onClick={() => { toggleNotifications(); onOpen?.() }}
      >
        <Bell size={17} />
      </PanelButton>
      <PanelButton
        label="Runs"
        count={runsInProgress}
        countLabel="in progress"
        badgeClass="bg-success"
        active={activePanel === 'runs'}
        onClick={() => { toggleRuns(); onOpen?.() }}
      >
        <Activity size={17} />
      </PanelButton>
    </div>
  )
}

function PanelButton({ label, count, countLabel, badgeClass, active, onClick, children }: {
  label: string
  count: number
  countLabel: string
  badgeClass: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label}, ${count} ${countLabel}` : label}
      aria-pressed={active}
      title={label}
      className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
        active ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
      }`}
    >
      {children}
      {count > 0 && (
        <span
          data-testid={`${label.toLowerCase()}-count`}
          className={`absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-micro font-semibold leading-none text-surface-0 ${badgeClass}`}
        >
          {formatCount(count)}
        </span>
      )}
    </button>
  )
}
