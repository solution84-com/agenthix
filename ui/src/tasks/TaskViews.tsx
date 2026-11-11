import type { ToolTask } from './taskGroups'
import { TaskGroupHeading } from './TasksToolParts'
import { ROW_ITEM, FOCUS_RING_INSET } from '../primitives/controlStyles'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** The last 30 days of finished work, newest first, each with its result line. */
export function DoneList({ tasks, onOpen, showProject }: { tasks: ToolTask[]; onOpen: (task: ToolTask) => void; showProject?: boolean }) {
  return (
    <div>
      <div className="px-4 pb-1 pt-3"><TaskGroupHeading count={tasks.length}>Done in the last 30 days</TaskGroupHeading></div>
      {tasks.length === 0 && <p className="px-4 py-4 text-small text-text-muted">Nothing was finished in the last 30 days.</p>}
      <ul className="divide-y divide-border-subtle">
        {tasks.map(t => (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t)} className={`block w-full space-y-0.5 px-4 py-2.5 text-left ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
              <span className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-micro text-text-muted">{t.key}</span>
                <span className="truncate text-body text-text-primary">{t.title}</span>
                <span className="ml-auto shrink-0 text-micro text-text-muted">{t.doneAt ? day(t.doneAt) : ''}</span>
              </span>
              <span className="line-clamp-2 block text-small text-text-secondary">{t.result || 'No result recorded.'}</span>
              {(showProject && t.project) && <span className="block text-micro text-text-muted">{t.project.name}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
