import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Modal } from '@agenthix/ui/primitives'
import type { SprintSummary } from '../projectSprintView'
import { planSprintPath, sprintBoardPath } from './sprintPaths'
import { pastLine, plannedText, sprintSpanText } from './sprintWords'

const LINK = 'inline-flex items-center gap-0.5 whitespace-nowrap rounded text-small text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent max-lg:min-h-11'
const ROW = 'grid min-h-11 grid-cols-[120px_180px_minmax(0,1fr)_auto] items-center gap-4 border-t border-border-subtle px-4 max-lg:flex max-lg:min-h-13 max-lg:gap-2 max-lg:px-3'

/**
 * The upcoming sprints (the design's key 4): each with its dates and how many tasks are planned in it, and Plan it.
 * While fewer than the most are planned ahead, one more can be added.
 */
export function UpcomingSprints({ sprints, projectKey, addAhead }: {
  sprints: SprintSummary[]
  projectKey: string
  /** Adds the next sprint ahead; absent when no more can be, or the person may not. */
  addAhead?: { label: string; onAdd: () => void }
}) {
  if (sprints.length === 0 && !addAhead) return null
  return (
    <section aria-label="Upcoming" className="rounded-xl border border-border bg-card">
      <h3 className="px-4 py-3 text-small font-semibold text-text-primary max-lg:px-3">Upcoming</h3>
      {sprints.map((s, i) => {
        const when = `${sprintSpanText(s.startDate, s.finishDate)}${i === 0 ? ' · next' : ''}`
        return (
          <div key={s.id} className={ROW}>
            <b className="truncate text-small font-semibold text-text-primary max-lg:hidden">{s.title}</b>
            <span className="whitespace-nowrap text-micro text-text-secondary max-lg:hidden">{when}</span>
            <span className={`truncate text-small max-lg:hidden ${s.counts.total ? 'text-text-secondary' : 'text-text-muted'}`}>{plannedText(s.counts.total)}</span>
            <span className="min-w-0 flex-1 lg:hidden">
              <b className="block truncate text-small font-semibold text-text-primary">{s.title}</b>
              <span className="block text-micro text-text-muted">{when} · {plannedText(s.counts.total).toLowerCase()}</span>
            </span>
            <Link to={planSprintPath(projectKey, s.id)} className={LINK} aria-label={`Plan ${s.title}`}>Plan it<ChevronRight size={14} aria-hidden /></Link>
          </div>
        )
      })}
      {addAhead && (
        <div className={`${ROW} lg:flex`}>
          <button type="button" onClick={addAhead.onAdd} className={LINK}>{addAhead.label}<ChevronRight size={14} aria-hidden /></button>
        </div>
      )}
    </section>
  )
}

/** Past sprints (the design's key 5): a simple list, newest first, with what was done and what moved on; each opens its tasks. */
export function PastSprintsDialog({ sprints, projectKey, onClose }: { sprints: SprintSummary[]; projectKey: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Past sprints">
      <p className="-mt-2 mb-2 text-small text-text-muted">{sprints.length} · newest first</p>
      <ul aria-label="Past sprints">
        {sprints.map(s => (
          <li key={s.id} className="border-t border-border-subtle">
            <Link
              to={sprintBoardPath(projectKey, s.id)}
              className="grid min-h-11 grid-cols-[80px_110px_minmax(0,1fr)_20px] items-center gap-3 rounded px-1 hover:bg-surface-hover max-sm:grid-cols-[minmax(0,1fr)_20px] max-sm:py-1.5"
            >
              <b className="truncate text-small font-semibold text-text-primary max-sm:hidden">{s.title}</b>
              <span className="whitespace-nowrap text-micro text-text-secondary max-sm:hidden">{sprintSpanText(s.startDate, s.finishDate)}</span>
              <span className="min-w-0 truncate text-small text-text-secondary">
                <span className="block truncate text-small font-semibold text-text-primary sm:hidden">{s.title} · {sprintSpanText(s.startDate, s.finishDate)}</span>
                {pastLine(s)}
              </span>
              <ChevronRight size={14} aria-hidden className="text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
