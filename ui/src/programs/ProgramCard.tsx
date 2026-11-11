import type { ProgramListItem } from './types'
import { CARD_CLICKABLE } from '../primitives/controlStyles'

interface ProgramCardProps {
  program: ProgramListItem
  href: string
  onClick?: () => void
}

export function ProgramCard({ program, href, onClick }: ProgramCardProps) {
  const statusColor: Record<string, string> = {
    planning: 'bg-warning/15 text-warning border-warning/25',
    active: 'bg-success/15 text-success border-success/25',
    archived: 'bg-surface-2 text-text-muted border-border',
  }
  const badge = program.status ? (statusColor[program.status] ?? statusColor.archived) : ''

  return (
    <a href={href} onClick={onClick} className={`block rounded-xl border bg-card p-4 space-y-2 ${CARD_CLICKABLE}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-h3 font-medium text-text-primary leading-snug">{program.name}</h3>
        {program.status && <span className={`shrink-0 text-small px-2 py-0.5 rounded-full border ${badge}`}>{program.status}</span>}
      </div>
      <p className="text-small text-text-muted line-clamp-2">{program.description ?? 'No description'}</p>
      <p className="text-small text-text-muted">{program.projectCount} project{program.projectCount !== 1 ? 's' : ''}</p>
    </a>
  )
}
