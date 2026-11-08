import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, getTaskComments } from 'wasp/client/operations'
import { TaskRunsTimeline, TaskTabs, type TaskTab } from '@agenthix/ui/tasks'
import type { MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { useTaskRuns } from '../pages/useTaskRuns'
import { renderMarkdown } from '../pages/TaskSessionPane'
import { TaskCommentsTab, shownComments } from './TaskCommentsTab'
import { TaskActivityTab } from './TaskActivityTab'
import { isEpicTask } from './taskKind'

const TABS: TaskTab[] = ['tasks', 'comments', 'runs', 'activity']

export interface TaskRecordTask {
  id: string
  key: string
  projectId?: string
  runState: string
  type?: { kind: string } | null
  assignedAgent?: { name: string; avatarUrl?: string | null } | null
}

/**
 * The task page's three tabs filled (T0): Comments, Runs and Activity, the open one kept in the address
 * (`?tab=runs&run=<id>` opens a run, as *See it in Runs* does; `?tab=comments&comment=<id>` a comment). An epic's page
 * passes its Tasks tab, and has no Runs.
 */
export function TaskRecordTabs({ task, canChange, embed, tasks }: {
  task: TaskRecordTask
  /** Whether the person may comment and stop a run (not a project Viewer). */
  canChange: boolean
  embed?: MarkdownEmbedContext
  tasks?: { count?: number; content: ReactNode }
}) {
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab') as TaskTab | null
  const tab = asked && TABS.includes(asked) ? asked : undefined
  const go = (next: TaskTab, extra: Record<string, string> = {}) => setParams(p => {
    const q = new URLSearchParams(p)
    q.set('tab', next)
    q.delete('run')
    q.delete('comment')
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return q
  }, { replace: true })

  const { data: comments } = useQuery(getTaskComments, { taskId: task.id })
  const runs = useTaskRuns(isEpicTask(task) ? null : task, canChange)
  const commentCount = shownComments((comments ?? []) as never).length

  return (
    <>
      <TaskTabs
        session={null}
        tab={tab}
        onTabChange={t => go(t)}
        tasks={isEpicTask(task) ? tasks : undefined}
        noRuns={isEpicTask(task)}
        commentCount={commentCount}
        runCount={runs.runCount}
        comments={
          <TaskCommentsTab
            taskId={task.id} taskKey={task.key} agentName={task.assignedAgent?.name} canComment={canChange} embed={embed}
            focusCommentId={params.get('comment')}
          />
        }
        runs={isEpicTask(task) ? undefined : (
          // On the task's page an opened run answers nothing: a request is answered in Now and Run again is the header's,
          // so each action has one place and the page one filled button.
          <TaskRunsTimeline {...runs.timeline} openRunId={params.get('run')} renderMarkdown={renderMarkdown} recordActions={undefined}
            approvalWaitingFor={canChange ? 'Answer it in Now, above' : runs.timeline.approvalWaitingFor}
          />
        )}
        activity={
          <TaskActivityTab
            taskId={task.id} projectId={task.projectId}
            onOpen={o => (o.tab === 'runs' ? go('runs', { run: o.runId }) : go('comments', { comment: o.commentId }))}
          />
        }
      />
      {runs.dialog}
    </>
  )
}
