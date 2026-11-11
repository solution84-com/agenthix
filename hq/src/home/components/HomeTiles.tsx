import type { ReactNode } from 'react'
import { CARD_CLICKABLE, FOCUS_RING } from '@agenthix/ui/primitives'
import { useNavigate } from 'react-router'
import { useShellPanels } from '../../shared/context/useShellPanels'
import type { HomeSignals as Counts } from '../../shared/homeTypes'
import { signalLabels } from '../homeText'

function Tile({ count, label, words, tone, onClick }: { count: number | null; label: string; words?: string; tone?: 'amber' | 'green'; onClick: () => void }): ReactNode {
  const toneClass = tone === 'amber' ? `border-warning/40 bg-warning/10 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING}` : `bg-card ${CARD_CLICKABLE}`
  const numberClass = tone === 'amber' ? 'text-warning' : tone === 'green' ? 'text-success' : 'text-text-primary'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={words}
      className={`rounded-xl border px-3 py-2 text-left transition-colors ${toneClass}`}
    >
      <span className={`block text-h2 font-medium ${numberClass}`}>{count ?? '–'}</span>
      <span className="block text-small text-text-secondary">{label}</span>
    </button>
  )
}

/**
 * The state of HQ in four numbers (the board's f5, Home): what needs the person, what is running now and what
 * comes up before their day ends — each counting only the person's own, each opening where to act on it:
 * Notifications, Runs, and the Automation of their own space in Chat.
 */
export function HomeTiles({ counts }: { counts: Counts | undefined }) {
  const navigate = useNavigate()
  const { openNotifications, openRuns } = useShellPanels()
  const labels = counts ? signalLabels(counts) : null
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="home-signals">
      <Tile
        count={counts?.notificationsNeedingYou ?? null}
        label="Need you" words={labels?.notifications}
        tone={counts && counts.notificationsNeedingYou > 0 ? 'amber' : undefined}
        onClick={openNotifications}
      />
      <Tile count={counts?.agentsAtWork ?? null} label="Running now" words={labels?.runs} tone={counts && counts.agentsAtWork > 0 ? 'green' : undefined} onClick={openRuns} />
      <Tile count={counts?.comingUpToday ?? null} label="Coming up today" words={labels?.comingUp} onClick={() => navigate('/chat?tool=automation')} />
    </div>
  )
}
