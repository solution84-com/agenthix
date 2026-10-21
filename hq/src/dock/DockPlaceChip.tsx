import { Link } from 'react-router'
import { CircleDot, FolderKanban, UserRound } from 'lucide-react'
import type { DockPlace } from './useDockPlace'

const ICONS = { space: UserRound, project: FolderKanban, task: CircleDot } as const

/** Where the open conversation lives: your space, a project or a task. It opens that place in the canvas. */
export function DockPlaceChip({ place }: { place: DockPlace }) {
  const Icon = ICONS[place.kind]
  return (
    <Link
      to={place.href}
      data-testid="dock-place-chip"
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-small text-accent hover:bg-surface-hover"
    >
      <Icon size={12} aria-hidden className="shrink-0" />
      <span className="truncate">{place.label}</span>
    </Link>
  )
}
