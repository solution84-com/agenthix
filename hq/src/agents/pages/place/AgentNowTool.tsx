import { Link } from 'react-router'
import { whenLabel } from '@agenthix/ui/projects'
import type { AgentPlaceView } from '../../agentPlaceQueries'
import { durationLabel } from '../agentCardView'
import { FOCUS_RING_INSET } from '@agenthix/ui/primitives'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'

/** Now and Coming up across every project (spec §3): what needs the person, what is running, what starts next. */
export function AgentNowTool({ view }: { view: Pick<AgentPlaceView, 'nowItems' | 'comingUp'> }) {
  const at = new Date()
  return (
    <div className="space-y-5 p-4">
      <section aria-label="Now">
        <h3 className={HEADING}>Now</h3>
        {view.nowItems.length === 0 && <p className="mt-2 text-small text-text-muted">Nothing needs you and nothing is running.</p>}
        {view.nowItems.map((item) => (
          <Link key={item.taskId} to={`/tasks/${item.key}`} className={`mt-1 block rounded-lg px-2 py-1.5 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET}`}>
            <div className="truncate text-body text-text-primary"><span className="font-mono text-small text-text-muted">{item.key}</span> {item.title}</div>
            <div className="text-small">
              {item.kind === 'needsYou'
                ? <span className="font-medium text-warning">Needs you</span>
                : <span className="font-medium text-success">Running{item.since ? ` · ${durationLabel(item.since, at)}` : ''}</span>}
              <span className="text-text-muted"> · {item.projectName}{item.kind === 'needsYou' && item.reason ? ` · ${item.reason}` : ''}</span>
            </div>
          </Link>
        ))}
      </section>
      <section aria-label="Coming up">
        <h3 className={HEADING}>Coming up</h3>
        {view.comingUp.length === 0 && <p className="mt-2 text-small text-text-muted">Nothing is set to start.</p>}
        {view.comingUp.map((item) => (
          <div key={item.kind === 'task' ? item.taskId : item.routineId} className="mt-1 px-2 py-1.5">
            <div className="truncate text-body text-text-primary">
              {item.kind === 'task' && <span className="font-mono text-small text-text-muted">{item.key} </span>}{item.title}
            </div>
            <div className="text-small text-text-muted">▶ {whenLabel(item.at, at)} · {item.projectName}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
