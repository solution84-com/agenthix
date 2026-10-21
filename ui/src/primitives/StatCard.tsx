import type { LucideIcon } from 'lucide-react'

export interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  /** 'primary' = accent purple, 'secondary' = success green. */
  accent?: 'primary' | 'secondary'
  /** Small suffix shown next to the value (e.g. "75%"). */
  subLabel?: string
}

const ACCENT_ICON: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary:   'bg-accent/10 text-accent',
  secondary: 'bg-success/10 text-success',
}

const ACCENT_SUBLABEL: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary:   'text-accent',
  secondary: 'text-success',
}

export function StatCard({ label, value, icon: Icon, accent = 'primary', subLabel }: StatCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-1 border border-border-subtle">
      <div className="space-y-1 text-left">
        <div className="text-micro font-medium text-text-muted uppercase tracking-wide leading-none">{label}</div>
        <div className="text-h1 font-semibold text-text-primary leading-none mt-2">
          {value}
          {subLabel && <span className={`text-micro ml-1.5 ${ACCENT_SUBLABEL[accent]}`}>{subLabel}</span>}
        </div>
      </div>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${ACCENT_ICON[accent]}`}>
        <Icon size={24} />
      </div>
    </div>
  )
}
