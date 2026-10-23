import { useQuery, useAction } from 'wasp/client/operations'
import { createTask, getBoards } from 'wasp/client/operations'
import { CreateTaskModal as UICreateTaskModal } from '@agenthix/ui/tasks'
import type { CreateTaskModalSlotProps } from '@agenthix/ui/board'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { TaskModelField } from '../../models-settings/components/TaskModelField'

// Slot wrapper: fetches the project's agents + boards, delegates to @agenthix/ui's presenter.
export function CreateTaskModal({
  open,
  onClose,
  projectId,
  defaultBoardId,
  defaultStage,
  defaultTitle,
  onCreated,
}: CreateTaskModalSlotProps & { defaultTitle?: string }) {
  const agents = useProjectAgents(projectId)
  const { data: boards = [] } = useQuery(getBoards, { projectId }, { enabled: !!projectId })
  const createTaskFn = useAction(createTask)

  return (
    <UICreateTaskModal
      open={open}
      onClose={onClose}
      projectId={projectId}
      defaultBoardId={defaultBoardId}
      defaultStage={defaultStage}
      defaultTitle={defaultTitle}
      agents={agents}
      // @agenthix/ui's form still names a board's columns `stages`, and a task's column `stage`.
      boards={(boards as Array<{ columns: unknown }>).map(b => ({ ...b, stages: b.columns })) as any[]}
      onSubmit={async ({ stage, ...input }) => {
        await createTaskFn({ ...input, column: stage ?? undefined })
      }}
      onCreated={onCreated}
      modelField={({ agentId, value, onChange }) => <TaskModelField projectId={projectId} agentId={agentId} value={value} onChange={onChange} />}
    />
  )
}
