import { useEffect, useState } from 'react'
import { useQuery, getTaskActivity, getTaskTypes, getAgents, getCustomFields } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAttention } from '../../shared/components/AttentionDialog'
import { TaskActivityList, activityLines, type ActivityLine, type ActivityNames, type TaskActivityRowLike } from '@agenthix/ui/tasks'
import { pressFailureWords } from '../../shared/failureWords'

const PAGE = 100

/**
 * The task page's Activity tab (T0): everything that happened to the task, newest first, one line each, a page of
 * a hundred at a time. The rows keep ids; columns and agents are named from the project's own lists.
 */
export function TaskActivityTab({ taskId, projectId, onOpen }: {
  taskId: string
  projectId?: string
  onOpen: (opens: NonNullable<ActivityLine['opens']>) => void
}) {
  const firstQuery = useQuery(getTaskActivity, { taskId })
  const { data: first, isLoading } = firstQuery
  const read = useBackgroundRead(firstQuery, { what: 'The activity' })
  const attention = useAttention()
  const { data: types } = useQuery(getTaskTypes, projectId ? { projectId, includeArchived: true } : undefined, { enabled: !!projectId })
  const { data: fields } = useQuery(getCustomFields, projectId ? { projectId, includeArchived: true } : undefined, { enabled: !!projectId })
  const { data: agents } = useQuery(getAgents)
  const [older, setOlder] = useState<TaskActivityRowLike[]>([])
  const [more, setMore] = useState<{ busy: boolean; done: boolean }>({ busy: false, done: false })
  useEffect(() => { setOlder([]); setMore({ busy: false, done: false }) }, [taskId])

  const rows = [...((first ?? []) as TaskActivityRowLike[]), ...older]
  const names: ActivityNames = {
    column: id => types?.flatMap(t => t.columns).find(c => c.id === id)?.name,
    field: id => (fields as { id: string; name: string }[] | undefined)?.find(f => f.id === id)?.name,
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
    } catch (err) {
      setMore({ busy: false, done: false })
      attention.show({ title: 'Earlier activity could not be read', text: pressFailureWords(err, 'HQ did not answer.'), retry: () => void loadOlder() })
    }
  }

  if (read.failedWithoutData) return read.nudge
  return (
    <>
      {read.nudge}
      <TaskActivityList
        lines={activityLines(rows, names)}
        onOpen={onOpen}
        onMore={hasMore ? () => void loadOlder() : undefined}
        loading={isLoading || more.busy}
      />
      {attention.dialog}
    </>
  )
}
