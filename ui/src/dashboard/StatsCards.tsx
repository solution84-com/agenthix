import type { ReactNode } from 'react'

interface Stat {
  label: string
  num: number | string
  sub?: ReactNode
  accent?: boolean
}

export interface StatsCardsProps {
  stats: Stat[]
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
      {stats.map((s, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-2xl p-5"
        >
          <div className={`text-micro font-medium uppercase tracking-wide mb-2.5 ${
            s.accent ? 'text-text-primary' : 'text-text-muted'
          }`}>
            {s.label}
          </div>
          <div className="text-h1 font-medium text-text-primary leading-none -tracking-[0.02em]">
            {s.num}
          </div>
          {s.sub && (
            <div className="text-small text-text-secondary mt-2 flex items-center gap-1.5">{s.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}
