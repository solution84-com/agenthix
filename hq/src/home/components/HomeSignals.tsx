import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useShellPanels } from '../../shared/context/useShellPanels'
import type { HomeSignals as Counts } from '../../shared/homeTypes'
import { signalLabels } from '../homeText'

function Signal({ onClick, dot, children }: { onClick: () => void; dot?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-3 py-1 text-small text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
    >
      {dot && <span aria-hidden className={dot}>●</span>}
      {children}
    </button>
  )
}

/**
 * Is anything waiting on me? (spec §8): one line of buttons, each counting only
 * the person's own, each opening where to act on it — Notifications, Runs, and
 * the Automation of their own space in Chat.
 */
export function HomeSignals({ counts }: { counts: Counts | undefined }) {
  const navigate = useNavigate()
  const { openNotifications, openRuns } = useShellPanels()
  if (!counts) return <div className="h-7" />
  const labels = signalLabels(counts)
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="home-signals">
      <Signal onClick={openNotifications} dot={counts.notificationsNeedingYou > 0 ? 'text-danger' : undefined}>{labels.notifications}</Signal>
      <Signal onClick={openRuns} dot={counts.agentsAtWork > 0 ? 'text-success' : undefined}>{labels.runs}</Signal>
      <Signal onClick={() => navigate('/chat?tool=automation')}>{labels.comingUp}</Signal>
    </div>
  )
}
