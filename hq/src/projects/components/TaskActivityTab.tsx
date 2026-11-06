import { useEffect, useState } from 'react'
import { useQuery, getTaskActivity, getBoards, getAgents } from 'wasp/client/operations'
import { TaskActivityList, activityLines, type ActivityLine, type ActivityNames, type TaskActivityRowLike } from '@agenthix/ui/tasks'

const PAGE = 100

/**
 * The task page's Activity tab (T0): everything that happened to the task, newest first, one line each, a page of
 * a hundred at a time. The rows keep ids; boards, columns and agents are named from the project's own lists.
 */
export function TaskActivityTab({ taskId, projectId, onOpen }: {
  taskId: string
  projectId?: string
  onOpen: (opens: NonNullable<ActivityLine['opens']>) => void
}) {
  const { data: first, isLoading } = useQuery(getTaskActivity, { taskId })
  const { data: boards } = useQuery(getBoards, projectId ? { projectId, includeArchived: true } : undefined, { enabled: !!projectId })
  const { data: agents } = useQuery(getAgents)
  const [older, setOlder] = useState<TaskActivityRowLike[]>([])
  const [more, setMore] = useState<{ busy: boolean; done: boolean }>({ busy: false, done: false })
  useEffect(() => { setOlder([]); setMore({ busy: false, done: false }) }, [taskId])

  const rows = [...((first ?? []) as TaskActivityRowLike[]), ...older]
  const names: ActivityNames = {
    board: id => boards?.find(b => b.id === id)?.name,
    column: (boardId, column) => boards?.find(b => b.id === boardId)?.columns.find(c => c.name === column)?.label,
    agent: id => (agents as { id: string; name: string }[] | undefined)?.find(a => a.id === id)?.name,
  }
  const hasMore = !more.done && rows.length >= PAGE && rows.length % PAGE === 0
  const loadOlder = async () => {
    const last = rows[rows.length - 1]
    if (!last) return
    setMore({ busy: true, done: false })
    try {
      const page = (await getTaskActivity({ taskId, before: new Date(last.createdAt).toISOString() })) as TaskActivityRowLike[]
      setOlder(o => [...o, ...page])
      setMore({ busy: false, done: page.length < PAGE })
    } catch {
      setMore({ busy: false, done: false })
    }
  }

  return (
    <TaskActivityList
      lines={activityLines(rows, names)}
      onOpen={onOpen}
      onMore={hasMore ? () => void loadOlder() : undefined}
      loading={isLoading || more.busy}
    />
  )
}
