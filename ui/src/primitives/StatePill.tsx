import type { ReactNode } from 'react'

// The colour only repeats the words: a pill always says its state ("Healthy", "Disk 91%", "Asleep since 18:02").
export type PillTone = 'healthy' | 'warning' | 'danger' | 'neutral'

const TONE: Record<PillTone, string> = {
  healthy: 'bg-success/13 text-success',
  warning: 'bg-warning/13 text-warning',
  danger: 'bg-danger/12 text-danger',
  neutral: 'bg-chip text-text-secondary',
}

/** The pill's shape, shared with HostingBadge. */
export const PILL_SHAPE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-micro leading-[18px] font-semibold'

export interface StatePillProps {
  tone?: PillTone
  children: ReactNode
  className?: string
}

export function StatePill({ tone = 'neutral', children, className = '' }: StatePillProps) {
  return (
    <span className={`${PILL_SHAPE} ${TONE[tone]} ${className}`}>
      {children}
    </span>
  )
}
