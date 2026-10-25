import { useState } from 'react'
import { startWorkflowRun, useAction } from 'wasp/client/operations'
import type { WorkflowDefinition } from '@agenthix/core'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { useWorkspaces } from '../../storage/pages/filesToolData'
import { parameterAccepts, parameterRule } from '../pages/workflowWords'
import type { WorkflowPlace } from '../pages/workflowTypes'
import { ErrorLine } from './ErrorLine'

/**
 * Run (workflows spec part 5, U3): each parameter with its rule in words, refused here when the value doesn't match,
 * and where to run it. A workflow with no parameters and no workspace to choose runs at once, from its button.
 */
export function RunDialog({ open, onClose, place, workflowId, name, definition, onStarted }: {
  open: boolean
  onClose: () => void
  place: WorkflowPlace
  workflowId: string
  name: string
  definition: WorkflowDefinition
  onStarted: (runId: string) => void
}) {
  const start = useAction(startWorkflowRun)
  const { workspaces } = useWorkspaces({ ownerType: place.type, ownerId: place.id })
  const [values, setValues] = useState<Record<string, string>>({})
  const [workspaceId, setWorkspaceId] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const wrong = (p: WorkflowDefinition['parameters'][number]) => !parameterAccepts(p, values[p.name] ?? '')
  const submit = async () => {
    setTried(true)
    if (definition.parameters.some(wrong)) return
    setBusy(true)
    setError(null)
    try {
      const { runId } = await start({ workflowId, workspaceId: workspaceId || null, parameters: values })
      onClose()
      onStarted(runId)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Run ${name}`} maxWidth="max-w-md">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }} data-testid="run-dialog">
        {definition.parameters.length === 0 && <p className="text-small text-text-secondary">This workflow takes no parameters.</p>}
        {definition.parameters.map((p) => (
          <FormField
            key={p.name}
            label={p.name}
            htmlFor={`param-${p.name}`}
            hint={parameterRule(p)}
            error={tried && wrong(p) ? `That doesn't match: ${parameterRule(p)}. Nothing was changed.` : undefined}
          >
            <Input id={`param-${p.name}`} value={values[p.name] ?? ''} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} autoComplete="off" />
          </FormField>
        ))}
        {(workspaces?.length ?? 0) > 0 && (
          <FormField label="Run on" htmlFor="run-on">
            <select id="run-on" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-body text-text-primary">
              <option value="">The place's files</option>
              {workspaces!.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
        )}
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Run</Button>
        </div>
      </form>
    </Modal>
  )
}
