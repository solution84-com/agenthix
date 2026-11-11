import { useState } from 'react'
import { Play } from 'lucide-react'
import { startWorkflowRun, useAction } from 'wasp/client/operations'
import type { WorkflowDefinition } from '@agenthix/core'
import { Button } from '@agenthix/ui/primitives'
import { useWorkspaces } from '../../storage/pages/filesToolData'
import type { WorkflowPlace } from '../pages/workflowTypes'
import { RunDialog } from './RunDialog'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Run: unavailable while the workflow is off or has no approved version. A workflow with nothing to ask runs at once;
 * otherwise a dialog asks for the parameters (and where to run it, if the place has workspaces).
 */
export function RunButton({ place, workflowId, name, definition, enabled, onStarted, size = 'sm', className = '' }: {
  place: WorkflowPlace
  workflowId: string
  name: string
  definition: WorkflowDefinition | null
  enabled: boolean
  onStarted: (runId: string) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const start = useAction(startWorkflowRun)
  const { workspaces } = useWorkspaces({ ownerType: place.type, ownerId: place.id })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const available = enabled && definition !== null
  const asks = definition !== null && (definition.parameters.length > 0 || (workspaces?.length ?? 0) > 0)

  const press = async () => {
    if (asks) { setOpen(true); return }
    setError(null)
    try {
      const { runId } = await start({ workflowId, workspaceId: null, parameters: {} })
      onStarted(runId)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <>
      <Button size={size} className={className} disabled={!available} leadingIcon={<Play size={12} aria-hidden />} onClick={() => void press()} title={available ? undefined : 'Turned off'} aria-label={`Run ${name}`}>
        Run
      </Button>
      <ShowAttention text={error} title="The workflow did not run" onClose={() => setError(null)} />
      {definition && <RunDialog open={open} onClose={() => setOpen(false)} place={place} workflowId={workflowId} name={name} definition={definition} onStarted={onStarted} />}
    </>
  )
}
