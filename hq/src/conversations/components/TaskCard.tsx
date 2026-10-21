import { Link } from 'react-router'
import { useQuery, getTask } from 'wasp/client/operations'
import type { TaskBody } from '../../shared/conversations/protocol'
import { taskPath } from '../toolLink'

const STATUS_WORDS: Record<string, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' }

type TaskNow = { column?: string | null; status?: string; assignedAgent?: { name: string } | null } | null

/** A task the conversation made or changed, as one line: key · title · where it is · who has it. Opens the task. */
export function TaskCard({ body }: { body: TaskBody }) {
  const { data } = useQuery(getTask, { taskId: body.taskId })
  const task: TaskNow | null | undefined = data
  const state = task ? task.column || STATUS_WORDS[task.status ?? ''] || null : null
  const assignee = task?.assignedAgent?.name ?? null
  return (
    <Link
      to={taskPath(body.taskKey)}
      data-testid="task-card"
      className="flex max-w-[720px] items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-small text-text-secondary hover:border-accent max-lg:min-h-10"
    >
      <span className="shrink-0 font-medium text-text-muted">{body.taskKey}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{body.title}</span>
      {state && <span className="shrink-0 text-text-muted">{state}</span>}
      {assignee && <span className="shrink-0 text-text-muted">· {assignee}</span>}
    </Link>
  )
}
