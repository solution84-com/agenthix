import { AgentAvatar } from '../sessions/SessionComponents'
import { NativeSelect } from '../primitives/NativeSelect'
import type { ToolTask } from './taskGroups'
import { PriorityDot, TaskGroupHeading } from './TasksToolParts'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Tasks on no board, each with Add to board (every screen reviewed spec §3). */
export function BacklogList({ tasks, boards, onOpen, onAddToBoard }: {
  tasks: ToolTask[]
  boards: { id: string; name: string }[]
  onOpen: (task: ToolTask) => void
  onAddToBoard: (task: ToolTask, boardId: string) => void
}) {
  return (
    <div className="@container">
      <div className="px-4 pb-1 pt-3"><TaskGroupHeading count={tasks.length}>Not on a board · by priority</TaskGroupHeading></div>
      {tasks.length === 0 && <p className="px-4 py-4 text-small text-text-muted">The backlog is empty.</p>}
      <ul className="divide-y divide-border-subtle">
        {tasks.map(t => (
          <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5">
            <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 items-center gap-2 text-left">
              <PriorityDot priority={t.priority} />
              <span className="shrink-0 font-mono text-micro text-text-muted">{t.key}</span>
              <span className="truncate text-body text-text-primary">{t.title}</span>
            </button>
            {boards.length > 0 && (
              <NativeSelect
                size="sm" value="" aria-label={`Add ${t.key} to a board`} className="!w-auto"
                onChange={e => { if (e.target.value) onAddToBoard(t, e.target.value) }}
              >
                <option value="">Add to board</option>
                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </NativeSelect>
            )}
            <div className="col-span-2 flex items-center gap-1.5 text-small text-text-muted">
              {t.agent ? <><AgentAvatar name={t.agent.name} size="sm" />{t.agent.name}</> : 'No agent'}
              <span aria-hidden>·</span>{day(t.createdAt)}
            </div>
          </li>
        ))}
      </ul>
      <p className="px-4 py-3 text-small text-text-muted">Or ask in the conversation: "plan the backlog into Sprint 4".</p>
    </div>
  )
}

/** The last 30 days of finished work, newest first, each with its result line. */
export function DoneList({ tasks, onOpen, showProject }: { tasks: ToolTask[]; onOpen: (task: ToolTask) => void; showProject?: boolean }) {
  return (
    <div>
      <div className="px-4 pb-1 pt-3"><TaskGroupHeading count={tasks.length}>Done in the last 30 days</TaskGroupHeading></div>
      {tasks.length === 0 && <p className="px-4 py-4 text-small text-text-muted">Nothing was finished in the last 30 days.</p>}
      <ul className="divide-y divide-border-subtle">
        {tasks.map(t => (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t)} className="block w-full space-y-0.5 px-4 py-2.5 text-left hover:bg-surface-hover">
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
