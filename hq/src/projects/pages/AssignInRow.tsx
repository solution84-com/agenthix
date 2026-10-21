import { useAction, updateTask } from 'wasp/client/operations'
import { NativeSelect } from '../../shared/components/ui/NativeSelect'
import { useProjectAgents } from '../hooks/useProjectAgents'

/** Assign in a task's row: the project's agents to choose from; choosing one assigns it. */
export function AssignInRow({ taskId, projectId, onError }: { taskId: string; projectId: string; onError: (message: string) => void }) {
  const agents = useProjectAgents(projectId)
  const update = useAction(updateTask)
  return (
    <NativeSelect
      size="sm"
      value=""
      aria-label="Assign an agent"
      className="!w-auto"
      onChange={e => {
        if (!e.target.value) return
        update({ taskId, assignedAgentId: e.target.value }).catch(err => onError(err instanceof Error ? err.message : 'That did not work'))
      }}
    >
      <option value="">Assign</option>
      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </NativeSelect>
  )
}
