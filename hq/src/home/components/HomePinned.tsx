import { Link } from 'react-router'
import { useQuery, getPins, getProjectCards } from 'wasp/client/operations'
import { PlaceAvatar } from '@agenthix/ui/primitives'

/** What a pinned project's line says: the numbers the Projects list shows, or that it is quiet. */
export function projectLine(card: { needsYouCount: number; runningCount: number } | undefined): string {
  if (!card) return ''
  const parts = [
    card.needsYouCount > 0 ? `${card.needsYouCount} ${card.needsYouCount === 1 ? 'needs' : 'need'} you` : null,
    card.runningCount > 0 ? `${card.runningCount} running` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'All quiet'
}

/** The projects the person pinned, with what is going on in each; the whole list is on Projects. */
export function HomePinned() {
  const { data: pins } = useQuery(getPins)
  const { data: cards } = useQuery(getProjectCards)
  const projects = (pins ?? []).filter((p) => p.kind === 'PROJECT')
  return (
    <section aria-label="Pinned projects" className="rounded-xl border border-border-subtle bg-surface-1 px-3 py-2">
      <div className="flex items-baseline justify-between pb-1">
        <h2 className="text-small font-semibold text-text-primary">Pinned projects</h2>
        <Link to="/projects" className="text-small font-medium text-accent hover:underline">All projects</Link>
      </div>
      {projects.length === 0 ? (
        <p className="py-2 text-small text-text-muted">{pins ? 'Pin a project to see what is going on in it here.' : 'Loading…'}</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id} className="border-t border-border-subtle first:border-t-0">
              <Link to={p.href} className="flex items-center gap-2 py-2 hover:bg-surface-hover">
                <PlaceAvatar kind="project" id={p.itemId} name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-text-primary">{p.name}</span>
                  <span className="block truncate text-micro text-text-muted">{projectLine(cards?.cards.find((c) => c.projectId === p.itemId))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
