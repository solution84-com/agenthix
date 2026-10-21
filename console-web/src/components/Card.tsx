import type { ReactNode } from 'react'

/** A card that stands on the page: soft border, 14px corners, room inside. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[14px] border border-border bg-card px-5 py-[18px] ${className}`}>{children}</div>
}

/** One item of a list: its name first, then its facts and state at the right. */
export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-2 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 ${className}`}>{children}</div>
}

/** A label and its value, the label quiet; in a narrow card the label sits above its value. */
export function KeyValueRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 py-1.5 text-small @min-[26rem]:grid-cols-[minmax(120px,190px)_minmax(0,1fr)]">
        <span className="text-text-muted">{label}</span>
        <span className="min-w-0 text-text-primary">{children}</span>
      </div>
    </div>
  )
}
