import { getTaskWorkspaces, useQuery } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'

type Choices = { current: string | null; workspaces: { id: string; name: string; git: boolean }[] }

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

/** A new task's workspace before the person chooses: the project's only code workspace, or the project's files. */
export function defaultTaskWorkspace(choices: Choices | undefined): string {
  const code = (choices?.workspaces ?? []).filter(w => w.git)
  return code.length === 1 ? code[0].id : ''
}

/** What the choice means, said under it, so code work is not left in the project's files by accident. */
export function taskWorkspaceHint(choices: Choices | undefined, chosen: string): string | null {
  const all = choices?.workspaces ?? []
  const code = all.filter(w => w.git)
  const picked = all.find(w => w.id === chosen)
  if (picked?.git) return `Its runs work on a branch of their own in ${picked.name}, which you merge into main.`
  if (code.length === 0) return null
  const where = code.length === 1 ? `choose ${code[0].name}` : 'choose the workspace with Git it is for'
  return `${picked ? `${picked.name} has no Git, so this` : 'This'} task's runs don't work on a branch. If it changes code, ${where}.`
}

/**
 * The create form's field: labelled as the model field beside it is. Until the person chooses, it shows the project's
 * only code workspace when there is exactly one (`defaultTaskWorkspace`), and the form makes the task with it.
 */
export function TaskWorkspaceField({ projectId, value, onChange, disabled }: {
  projectId: string
  /** The person's choice: a workspace's id, '' for the project's files, or undefined before they choose. */
  value: string | undefined
  onChange: (workspaceId: string | null) => void
  disabled?: boolean
}) {
  const { data } = useQuery(getTaskWorkspaces, { projectId, taskId: null })
  const shown = value ?? defaultTaskWorkspace(data)
  const hint = taskWorkspaceHint(data, shown)
  return (
    <div>
      <span className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Workspace</span>
      <TaskWorkspaceSelect projectId={projectId} value={shown} onChange={onChange} disabled={disabled} />
      {hint && <p className="mt-1 text-micro text-text-muted" data-testid="task-workspace-hint">{hint}</p>}
    </div>
  )
}

/** The workspace a new task is made with: the person's choice, or the field's default when they made none. */
export function useNewTaskWorkspace(projectId: string, chosen: string | null | undefined): string | null {
  const { data } = useQuery(getTaskWorkspaces, { projectId, taskId: null })
  if (chosen !== undefined) return chosen
  return defaultTaskWorkspace(data) || null
}
