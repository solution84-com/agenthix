import { useState, type FormEvent } from 'react'
import { useAction, createTask, runTask } from 'wasp/client/operations'
import { FormField, Input, Modal, NativeSelect, Textarea } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import { useProjectAgents } from '../../projects/hooks/useProjectAgents'

/**
 * *New task* in the workspace view: a task on this workspace, made and started at once, so its run makes its branch
 * here. Only the assignee, the title and the description; the task's own page has the rest.
 */
export function NewTaskDialog({ projectId, workspaceId, workspaceName, onClose, onStarted }: {
  projectId: string
  workspaceId: string
  workspaceName: string
  onClose: () => void
  onStarted: (task: { id: string; title: string }) => void
}) {
  const agents = useProjectAgents(projectId)
  const create = useAction(createTask)
  const run = useAction(runTask)
  const [agentId, setAgentId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const chosenAgent = agentId || agents[0]?.id || ''
  const ready = !!chosenAgent && title.trim().length > 0 && !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setProblem(null)
    let made: { id: string; title: string } | null = null
    try {
      made = await create({ projectId, title: title.trim(), description: description.trim() || undefined, assignedAgentId: chosenAgent, workspaceId } as Parameters<typeof create>[0])
      await run({ taskId: made.id })
      onStarted(made)
    } catch (err) {
      const why = err instanceof Error ? err.message : 'It did not go through.'
      setProblem(made ? `The task was made, but its run did not start: ${why} Start it from the task's page.` : `${why} Nothing was changed.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`New task on ${workspaceName}`}>
      <form className="space-y-3 text-small" onSubmit={e => void submit(e)} data-testid="new-task-dialog">
        <p className="text-text-secondary">The agent starts at once, on a branch of its own in {workspaceName}. The branch shows here when its run begins.</p>
        <FormField label="Assignee" htmlFor="new-task-agent">
          <NativeSelect id="new-task-agent" size="sm" value={chosenAgent} onChange={e => setAgentId(e.target.value)} disabled={agents.length === 0}>
            {agents.length === 0 && <option value="">No agent works in this project</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Title" htmlFor="new-task-title">
          <Input id="new-task-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description" htmlFor="new-task-description">
          <Textarea id="new-task-description" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
        </FormField>
        {problem && <p role="alert" className="text-danger">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={FILES_BUTTON} onClick={onClose}>Cancel</button>
          <button type="submit" className={FILES_BUTTON_PRIMARY} disabled={!ready}>{busy ? 'Starting…' : 'Make and start'}</button>
        </div>
      </form>
    </Modal>
  )
}
