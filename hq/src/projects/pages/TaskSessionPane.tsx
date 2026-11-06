import { useSearchParams } from 'react-router'
import { useQuery, getTaskByKey } from 'wasp/client/operations'
import { TaskSessionView } from '@agenthix/ui/tasks'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { useTaskRuns, type TaskRunsTask } from './useTaskRuns'

export const renderMarkdown = (p: { content: string; className?: string }) => <MarkdownMessage content={p.content} className={p.className} />

/**
 * A task's runs inside the tools panel and on `/tasks/WEB-27/session`: the same timeline as the task page's Runs tab
 * (T0), under a header. Nothing is typed into a run here; the task's conversation steers the work.
 */
export function TaskSessionPane({ taskKey, onBack }: { taskKey: string; onBack?: () => void }) {
  const { data: task } = useQuery(getTaskByKey, { taskKey })
  const canAct = useMayWork(task?.projectId)
  const [params] = useSearchParams()
  const { timeline, runCount, dialog } = useTaskRuns(task as TaskRunsTask | null | undefined, canAct)
  const agentName = timeline.agentName
  return (
    <>
      <TaskSessionView
        {...timeline}
        backLabel={onBack ? taskKey : undefined}
        onBack={onBack}
        summary={`${taskKey} · ${agentName} · ${runCount} run${runCount === 1 ? '' : 's'}`}
        openRunId={params.get('run')}
        renderMarkdown={renderMarkdown}
      />
      {dialog}
    </>
  )
}

