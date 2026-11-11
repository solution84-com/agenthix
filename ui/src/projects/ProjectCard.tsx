import type { ElementType, MouseEvent } from 'react'
import { PlaceAvatar } from '../primitives/PlaceAvatar'
import { Button } from '../primitives/Button'
import { CARD_CLICKABLE_IN_GROUP, FOCUS_RING } from '../primitives/controlStyles'

/** What is going on in a project: how many of its tasks need you, are running, and are open. */
export interface ProjectCardCounts {
  needsYou: number
  running: number
  open: number
}

export interface ProjectCardData {
  id: string
  name: string
  /** At most two lines on the card, cut with …; *No description* when there is none. */
  description?: string | null
  /** The state line; absent while it is being read. */
  counts?: ProjectCardCounts | null
  /** An open project the person has not joined: the card's button is *Join*. */
  notJoined?: boolean
  /** Joins it; the card shows *Join* only with this. */
  onJoin?: () => void
  joining?: boolean
}

export interface ProjectCardProps {
  project: ProjectCardData
  /** Makes the whole card a link via the wrapper element (e.g. react-router's `Link`). */
  as?: ElementType
  /** Forwarded to the wrapper element (e.g. a `to` prop for react-router Link). */
  [key: string]: unknown
}

/** The state line's parts in their fixed order, each only when it counts something: *2 need you · 1 running · 6 open*. */
export function projectCountParts(counts: ProjectCardCounts): Array<{ text: string; needsYou: boolean }> {
  const parts: Array<{ text: string; needsYou: boolean }> = []
  if (counts.needsYou > 0) parts.push({ text: `${counts.needsYou} need${counts.needsYou === 1 ? 's' : ''} you`, needsYou: true })
  if (counts.running > 0) parts.push({ text: `${counts.running} running`, needsYou: false })
  if (counts.open > 0) parts.push({ text: `${counts.open} open`, needsYou: false })
  return parts
}

/** *2 need you · 1 running · 6 open*, or *Nothing open*. */
export function ProjectCountsLine({ counts }: { counts: ProjectCardCounts | null | undefined }) {
  if (!counts) return <span data-testid="project-state" className="text-text-muted">…</span>
  const parts = projectCountParts(counts)
  return (
    <span data-testid="project-state" className="text-text-secondary">
      {parts.length === 0 ? <span className="text-text-muted">Nothing open</span> : parts.map((p, i) => (
        <span key={p.text}>
          {i > 0 && ' · '}
          <span className={p.needsYou ? 'font-medium text-warning' : undefined}>{p.text}</span>
        </span>
      ))}
    </span>
  )
}

function JoinButton({ onJoin, joining }: { onJoin: () => void; joining?: boolean }) {
  // Inside the card's link: the press joins, and does not open the card.
  const press = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); onJoin() }
  return <Button type="button" variant="secondary" size="sm" disabled={joining} onClick={press}>{joining ? 'Joining…' : 'Join'}</Button>
}

/**
 * A project on the Projects screen. Every card is the same height: the name on one line, the description held to
 * two (or *No description*), and the state line and the button at the foot. Below `md` it is a compact row.
 */
export function ProjectCard({ project, as: Wrapper = 'div', ...rest }: ProjectCardProps) {
  const join = project.notJoined && project.onJoin
    ? <JoinButton onJoin={project.onJoin} joining={project.joining} />
    : null
  const description = project.description?.trim()
  return (
    <Wrapper {...rest} className={`group block h-full min-w-0 rounded-2xl ${FOCUS_RING}`}>
      <div
        data-testid="project-card"
        className={`hidden h-full flex-col rounded-2xl border bg-card p-4 md:flex ${CARD_CLICKABLE_IN_GROUP}`}
      >
        <PlaceAvatar kind="project" id={project.id} name={project.name} size="lg" />
        <div className="mt-2 truncate text-h3 font-medium text-text-primary">{project.name}</div>
        <p className={`mt-0.5 line-clamp-2 min-h-[2lh] text-small ${description ? 'text-text-muted' : 'italic text-text-muted'}`}>
          {description || 'No description'}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-2.5 text-small">
          <span className="min-w-0 truncate"><ProjectCountsLine counts={project.counts} /></span>
          {join ?? (project.notJoined ? null : <span className="shrink-0 text-body font-medium text-text-secondary">Open →</span>)}
        </div>
      </div>

      <div data-testid="project-card-row" className="flex items-center gap-3 rounded-lg px-1 py-2 ring-inset hover:ring-1 hover:ring-border-strong md:hidden">
        <span className="shrink-0"><PlaceAvatar kind="project" id={project.id} name={project.name} size="lg" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-medium text-text-primary">{project.name}</div>
          <div className="truncate text-small"><ProjectCountsLine counts={project.counts} /></div>
        </div>
        {join && <span className="shrink-0">{join}</span>}
      </div>
    </Wrapper>
  )
}
