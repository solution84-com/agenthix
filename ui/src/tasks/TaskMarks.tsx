import { Flag } from 'lucide-react'

const RING = {
  sm: { box: 14, r: 6, stroke: 2.5 },
  lg: { box: 44, r: 18, stroke: 5 },
} as const

/**
 * An epic's progress as a ring, the share of its tasks done: `sm` beside a row's title, `lg` on the epic's page.
 * One drawing for one measure, wherever it is shown.
 */
export function ProgressRing({ done, total, size = 'sm', showCount = size === 'sm' }: {
  done: number
  total: number
  size?: keyof typeof RING
  /** "3 / 5" beside the ring; the list shows it, the epic's page says it in words. */
  showCount?: boolean
}) {
  const { box, r, stroke } = RING[size]
  const c = box / 2
  const length = 2 * Math.PI * r
  const part = total === 0 ? 0 : done / total
  return (
    <span role="img" className="inline-flex shrink-0 items-center gap-1 text-micro text-text-secondary" aria-label={`${done} of ${total} done`}>
      <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} aria-hidden className="-rotate-90" data-size={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-success)" strokeWidth={stroke} strokeDasharray={`${part * length} ${length}`} />
      </svg>
      {showCount && <span aria-hidden>{done} / {total}</span>}
    </span>
  )
}

/** The mark of an epic, the same on a list's row and in a task page's header. */
export function EpicBadge() {
  return (
    <span data-testid="epic-badge" className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-surface-2 px-2 text-micro font-medium leading-[18px] text-text-secondary">
      Epic
    </span>
  )
}

const FLAG: Record<string, string> = { HIGH: 'text-danger', MEDIUM: 'text-warning', LOW: 'text-success' }

/** A task's priority: a flag in its colour and its word, so it is told apart from the column at a glance. */
export function PriorityFlag({ priority, label }: { priority: string; label: string }) {
  return (
    <span data-testid="priority-flag" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-micro leading-[18px] text-text-secondary">
      <Flag size={11} aria-hidden className={FLAG[priority] ?? 'text-text-muted'} />
      {label}
    </span>
  )
}
