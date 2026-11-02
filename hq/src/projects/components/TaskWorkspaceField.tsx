import { getTaskWorkspaces, useQuery } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'

/**
 * Where a task's work is done (live preview spec, part 2): the project's files, or one of its workspaces. A code
 * workspace (one with Git) makes its runs work on a branch of their own, which a person merges into main.
 */
export function TaskWorkspaceSelect({ projectId, taskId, value, onChange, disabled }: {
  projectId: string
  taskId?: string
  /** The workspace's id, or '' for the project's files; undefined shows the task's own. */
  value?: string
  onChange: (workspaceId: string | null) => void
  disabled?: boolean
}) {
  const { data } = useQuery(getTaskWorkspaces, { projectId, taskId: taskId ?? null })
  const shown = value ?? data?.current ?? ''
  return (
    <NativeSelect size="sm" aria-label="Workspace" value={shown} disabled={disabled || !data} onChange={e => onChange(e.target.value || null)}>
      <option value="">The project's files</option>
      {(data?.workspaces ?? []).map(w => <option key={w.id} value={w.id}>{w.git ? `${w.name} · Git` : w.name}</option>)}
    </NativeSelect>
  )
}

/** The create form's field: labelled as the model field beside it is. */
export function TaskWorkspaceField(props: Parameters<typeof TaskWorkspaceSelect>[0]) {
  return (
    <div>
      <span className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Workspace</span>
      <TaskWorkspaceSelect {...props} />
    </div>
  )
}
