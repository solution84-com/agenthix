import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { reorderPins, useAction } from 'wasp/client/operations'
import { movedProjectPin, type PinRef } from '../../shared/components/sidebar/projectChoices'
import type { ProjectRow } from './ProjectCardsView'

const MOVE = `rounded-lg border border-border-subtle bg-surface-1 p-1 text-text-secondary not-disabled:hover:text-text-primary not-disabled:hover:bg-surface-hover ${DISABLED} ${FOCUS_RING}`
export const CARD_GRID = 'grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3'

/** The person's pinned projects at the top of the Projects list, in their order; Edit moves them earlier or later. */
export function PinnedProjects({ projects, pins, card }: { projects: ProjectRow[]; pins: PinRef[]; card: (p: ProjectRow) => ReactNode }) {
  const [editing, setEditing] = useState(false)
  const reorder = useAction(reorderPins)
  const move = (p: ProjectRow, step: -1 | 1) => {
    const pinIds = movedProjectPin(pins, p.id, step)
    if (pinIds) void reorder({ pinIds })
  }
  return (
    <section aria-labelledby="pinned-projects-heading">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="pinned-projects-heading" className="text-body font-medium text-text-primary">Pinned</h2>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} className={`rounded text-small text-link hover:underline ${FOCUS_RING}`}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className={CARD_GRID}>
        {projects.map((p, i) => (
          <div key={p.id} className="relative">
            {card(p)}
            {editing && (
              <div className="absolute bottom-3 right-3 z-10 flex gap-1">
                <button type="button" className={MOVE} disabled={i === 0} onClick={() => move(p, -1)} aria-label={`Move ${p.name} earlier`}><ArrowUp size={14} /></button>
                <button type="button" className={MOVE} disabled={i === projects.length - 1} onClick={() => move(p, 1)} aria-label={`Move ${p.name} later`}><ArrowDown size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
