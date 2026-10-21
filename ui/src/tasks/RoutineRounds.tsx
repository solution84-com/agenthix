import type { ReactNode } from 'react'
import { OverflowMenu } from './OverflowMenu'
import { ROUND_STATE_WORDS, roundWhen, tookText, type RoutineRoundState } from './RoutineWords'

export interface RoutineRoundItem {
  id: string
  key: string
  roundAt: string | null
  state: RoutineRoundState
  /** Why a failed or blocked round stopped, when known. */
  reason?: string | null
  tookMs: number | null
}

const TONE: Record<RoutineRoundState, string> = {
  done: 'text-success', failed: 'text-danger', needsYou: 'text-warning', running: 'text-accent', waiting: 'text-text-muted',
}

export interface RoutineRoundListProps {
  rounds: RoutineRoundItem[]
  renderTaskLink: (round: RoutineRoundItem, children: ReactNode) => ReactNode
  /** Absent when the viewer may not unlink. */
  onUnlink?: (taskId: string) => Promise<void>
  /** Shown when there are older rounds than the list holds. */
  onOlder?: () => void
  now?: Date
}

/**
 * A routine's rounds, newest first (every screen reviewed spec §3): each one's
 * task, its time, what became of it and how long its run took; Unlink under ⋯.
 */
export function RoutineRoundList({ rounds, renderTaskLink, onUnlink, onOlder, now }: RoutineRoundListProps) {
  if (rounds.length === 0) return <p className="text-small text-text-muted">No rounds yet.</p>
  return (
    <div>
      <ul>
        {rounds.map(r => (
          <li key={r.id} className="flex items-center gap-2.5 border-b border-border-subtle py-2 text-small">
            <span className="w-16 shrink-0 truncate text-text-muted">{renderTaskLink(r, <span className="hover:underline">{r.key}</span>)}</span>
            <span className="min-w-0 flex-1 truncate text-text-secondary">{roundWhen(r.roundAt, now)}</span>
            <span className={`min-w-0 max-w-[55%] truncate ${TONE[r.state]}`} title={r.reason ?? undefined}>
              {ROUND_STATE_WORDS[r.state]}{r.reason && (r.state === 'failed' || r.state === 'needsYou') ? ` — ${r.reason}` : ''}
            </span>
            <span className="w-14 shrink-0 text-right text-text-muted">{r.state === 'waiting' ? '—' : tookText(r.tookMs)}</span>
            {onUnlink
              ? <OverflowMenu label={`More for ${r.key}`} items={[{ label: 'Unlink from this routine', onSelect: () => onUnlink(r.id) }]} />
              : <span className="w-7 shrink-0" aria-hidden />}
          </li>
        ))}
      </ul>
      {onOlder && (
        <button type="button" onClick={onOlder} className="mt-2 text-small text-accent hover:underline">Older rounds ›</button>
      )}
    </div>
  )
}
