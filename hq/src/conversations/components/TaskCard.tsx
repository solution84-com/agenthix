import { Link } from 'react-router'
import { ChevronRight, SquareCheck } from 'lucide-react'
import { useQuery, getTask } from 'wasp/client/operations'
import type { TaskBody } from '../../shared/conversations/protocol'
import { taskPath } from '../toolLink'
import { TASK_STATE_LABELS } from '@agenthix/core'

const STATE_WORDS: Record<string, string> = TASK_STATE_LABELS

type TaskNow = { typeColumn?: { name: string } | null; state?: string; assignedAgent?: { name: string } | null } | null

/** The quieter second line: what it is, its key, where it is, and who has it ("Task WEB-9 · To do · no agent yet"). */
export function taskCardLine(key: string, task: TaskNow | undefined): string {
  if (!task) return `Task ${key}`
  const state = task.typeColumn?.name || STATE_WORDS[task.state ?? ''] || null
  return [`Task ${key}`, state, task.assignedAgent?.name ?? 'no agent yet'].filter(Boolean).join(' · ')
}

/**
 * A task the turn made or changed, as one card at the end of the answer: its title on the first line (cut with …
 * when long), then what it is, its key and its state. The whole card opens the task.
 */
export function TaskCard({ body }: { body: TaskBody }) {
  const { data } = useQuery(getTask, { taskId: body.taskId })
  const task: TaskNow | null | undefined = data
  return (
    <Link
      to={taskPath(body.taskKey)}
      data-testid="task-card"
      className="flex max-w-[420px] items-center gap-3 rounded-lg border border-border-subtle px-3 py-2 hover:border-accent max-lg:min-h-12"
    >
      <SquareCheck size={16} aria-hidden className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium text-text-primary">{body.title}</span>
        <span className="block truncate text-micro text-text-muted">{taskCardLine(body.taskKey, task)}</span>
      </span>
      <ChevronRight size={16} aria-hidden className="shrink-0 text-text-muted" />
    </Link>
  )
}
