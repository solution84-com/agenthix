import { ChevronRight } from 'lucide-react'
import type { Place, PlaceTool } from '../placeTypes'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'

function ToolRow({ tool, onOpen }: { tool: PlaceTool; onOpen: (id: string) => void }) {
  const countTone = tool.tone === 'needs' ? 'text-warning' : tool.tone === 'live' ? 'text-success' : 'text-text-muted'
  return (
    <button
      type="button"
      onClick={() => onOpen(tool.id)}
      className="flex w-full items-center gap-2 py-2 text-left hover:bg-surface-hover -mx-2 px-2 rounded-md"
    >
      <span className="flex-1 min-w-0 truncate text-body text-text-primary">{tool.label}</span>
      {tool.avatars}
      {tool.count && <span className={`text-small shrink-0 ${countTone}`}>{tool.count}</span>}
      {/* A row with no count says it opens something. */}
      {(!tool.count || tool.avatars) && <ChevronRight size={14} className="shrink-0 text-text-muted" aria-hidden />}
    </button>
  )
}

/**
 * A place's Overview section: the facts; after a line, Members as a row with no heading; then the tools in sections,
 * each under a heading and a line, each row opening its section; Settings alone at the foot. No cards, and no lines
 * between rows.
 */
export function PlaceOverview({ place, onOpenTool }: { place: Place; onOpenTool: (id: string) => void }) {
  return (
    <div data-testid="place-overview">
      <section aria-label={place.factsHeading} className="border-b border-border-subtle pb-4">
        <h3 className={HEADING}>{place.factsHeading}</h3>
        {place.description && <p className="mt-2 text-body text-text-secondary">{place.description}</p>}
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body">
          {place.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-text-muted">{f.label}</dt>
              <dd className="min-w-0 truncate text-text-primary">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {place.teamRows && place.teamRows.length > 0 && (
        <section aria-label="People and agents" className="pt-3">
          {place.teamRows.map((row) => <ToolRow key={row.id} tool={row} onOpen={onOpenTool} />)}
        </section>
      )}

      <section aria-label="Tools">
        {place.toolGroups.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className={group.label ? 'mt-5' : 'mt-8'}>
            {group.label && <div className="mb-1 border-b border-border-subtle pb-1 text-small text-text-muted">{group.label}</div>}
            {group.tools.map((tool) => <ToolRow key={tool.id} tool={tool} onOpen={onOpenTool} />)}
            {group.footer}
          </div>
        ))}
      </section>
    </div>
  )
}
