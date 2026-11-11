import { agendaGroups } from './agenda'
import { barTone } from './barStyle'
import type { TimelineData, TimelineTaskData } from './types'
import { ROW_ITEM, FOCUS_RING_INSET } from '../primitives/controlStyles'

/** The timeline when it is narrow, or on a phone: This week · Next week · Later, a task and its date on each line. */
export function TimelineAgenda({ data, today, onOpen }: { data: TimelineData; today: number; onOpen: (task: TimelineTaskData) => void }) {
  const groups = agendaGroups(data, today)
  if (groups.every(g => g.lines.length === 0)) return <p className="px-4 py-6 text-small text-text-muted">Nothing is planned yet.</p>
  return (
    <div className="pb-4">
      {groups.map(g => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="px-4 pb-1 pt-4 text-small font-medium text-text-muted">{g.label} · {g.lines.length}</h3>
          {g.lines.length === 0 && <p className="px-4 py-1 text-small text-text-muted">Nothing.</p>}
          <ul>
            {g.lines.map(({ task, date }) => (
              <li key={task.id}>
                <button
                  type="button" onClick={() => onOpen(task)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${ROW_ITEM} ${FOCUS_RING_INSET}`}
                >
                  <span aria-hidden className={`h-3 w-1.5 shrink-0 rounded-sm border ${barTone(task).bar} ${task.needsYou ? 'ring-2 ring-warning' : ''}`} />
                  <span className="min-w-0 flex-1 truncate text-body text-text-primary">{task.title}</span>
                  <span className="shrink-0 text-small text-text-secondary">{date}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
