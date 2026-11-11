import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { CARD_CLICKABLE } from '@agenthix/ui/primitives'

/** A heading over a group of cards, with something quiet at its right. */
export function OrgGroupHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="text-micro font-medium uppercase tracking-wide text-text-muted">{title}</h2>
      {aside && <div className="text-small text-text-muted">{aside}</div>}
    </div>
  )
}

const CARD = 'flex min-h-[7rem] flex-col gap-2 rounded-2xl border bg-surface-1 p-4'

/** One card of the Organisation page: a title and what matters in it now. It opens its part when given `to`. */
export function OrgCard({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  const head = (
    <div className="flex items-center justify-between text-body font-medium text-text-primary">
      {title}
      {to && <ChevronRight size={16} className="text-text-muted" aria-hidden />}
    </div>
  )
  return to ? (
    <Link to={to} className={`${CARD} ${CARD_CLICKABLE}`}>{head}{children}</Link>
  ) : (
    <div className={`${CARD} border-border-subtle`}>{head}{children}</div>
  )
}

export function BigNumber({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="text-small text-text-secondary">
      <b className="mr-1.5 text-h1 font-medium text-text-primary">{value}</b>{label}
    </div>
  )
}

/** Two quiet texts on one line, the right one pushed to the edge. */
export function CardLine({ left, right, tone }: { left: ReactNode; right?: ReactNode; tone?: 'attention' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-small text-text-muted">
      <span className={`min-w-0 truncate ${tone === 'attention' ? 'font-medium text-warning' : ''}`}>{left}</span>
      {right && <span className="shrink-0">{right}</span>}
    </div>
  )
}

export function CardGrid({ children, columns = 'lg:grid-cols-3' }: { children: ReactNode; columns?: string }) {
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columns}`}>{children}</div>
}

/** A thin bar for a share of something: runs of the most at once, a programme's tasks done. */
export function Meter({ label, share, value, warn = false }: { label: string; share: number; value: string; warn?: boolean }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-small text-text-muted">
      <span>{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="presentation">
        <i className={`block h-full rounded-full ${warn ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
      </span>
      <span className="text-text-secondary">{value}</span>
    </div>
  )
}

/** Overlapping faces; the caller supplies each one, already drawn. */
export function FaceStack({ children, more }: { children: ReactNode; more?: number }) {
  return (
    <div className="flex items-center">
      <span className="flex items-center -space-x-1.5 [&>*]:ring-2 [&>*]:ring-surface-1">{children}</span>
      {more !== undefined && more > 0 && <span className="ml-2 text-small text-text-muted">+{more}</span>}
    </div>
  )
}
