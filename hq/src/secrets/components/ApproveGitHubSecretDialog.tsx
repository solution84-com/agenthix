import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getPlaceWorkflows, getWorkflow, approveWorkflowVersion, startWorkflowRun } from 'wasp/client/operations'
import { Button, Modal, StatePill } from '@agenthix/ui/primitives'
import { ErrorLine } from '../../workflows/components/ErrorLine'
import { levelWords } from '../../workflows/pages/workflowWords'
import type { SecretsPlace } from '../pages/secretsTypes'

const WORKFLOW = 'set-github-secrets'

/**
 * Opens straight after a secret is saved with *Also set it on GitHub*: the version of `set-github-secrets` that adds its
 * name. The card rule decides: when the checks let it be approved from here, *Approve and set it* approves it and runs
 * it for the production environment; otherwise only *Review all of it*, with the reason in one line.
 */
export function ApproveGitHubSecretDialog({ place, name, workspaceId, repoLabel, number, message, onClose }: {
  place: SecretsPlace
  name: string
  workspaceId: string
  repoLabel: string
  number: number | null
  message: string | null
  onClose: () => void
}) {
  const { data: library, refetch } = useQuery(getPlaceWorkflows, { place })
  const workflow = library?.workflows.find((w) => w.name === WORKFLOW)
  const { data: detail } = useQuery(getWorkflow, workflow ? { workflowId: workflow.id } : undefined, { enabled: !!workflow })
  const approve = useAction(approveWorkflowVersion)
  const start = useAction(startWorkflowRun)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [started, setStarted] = useState<string | null>(null)

  const version = detail?.versions.find((v) => v.number === number)
  const waiting = workflow?.waiting.find((v) => v.number === number)
  const mayDecide = library?.mayAdminister ?? false

  const approveAndRun = async () => {
    if (!workflow || !waiting) return
    setBusy(true)
    setError(null)
    try {
      await approve({ workflowId: workflow.id, hash: waiting.hash, via: 'card' })
      const { runId } = await start({ workflowId: workflow.id, workspaceId, parameters: { environment: 'production' } })
      setStarted(runId)
      await refetch()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={number ? `Approve: ${WORKFLOW}, version ${number}` : `${name} was added`} maxWidth="max-w-lg">
      <div className="space-y-3" data-testid="approve-github-secret">
        <p className="text-small text-text-secondary">{name} is saved here.</p>
        {message && <p role="status" className="text-small text-warning">{message}</p>}
        {number !== null && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {version && <StatePill tone={version.cardMayApprove ? 'healthy' : 'warning'}>Reviewer: {levelWords(version.reviewLevel)}</StatePill>}
              <StatePill tone="warning">+ {name}</StatePill>
              <StatePill>environments: write</StatePill>
            </div>
            <p className="text-small text-text-secondary">
              Adds one name to the secrets this workflow sets on {repoLabel}. Once on GitHub, any GitHub workflow in that repository, running in the production environment on a protected branch, can read it.
            </p>
            {version?.checkSummary && <p className="text-small text-text-muted">{version.checkSummary}</p>}
            {!mayDecide && <p className="text-small text-text-muted">An administrator of this place approves it; the proposal waits for them under Workflows.</p>}
            {started && workflow && <p role="status" className="text-small text-success">Approved and running. <Link className="underline" to={`/workflows/${workflow.id}/runs/${started}`}>Follow the run</Link></p>}
          </>
        )}
        <ErrorLine error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{started ? 'Done' : 'Not now'}</Button>
          {number !== null && !started && mayDecide && workflow && (
            version?.cardMayApprove === true
              ? <Button onClick={() => void approveAndRun()} disabled={busy || !waiting}>Approve and set it</Button>
              : <Link className="inline-flex items-center rounded-button bg-accent px-4 py-2 text-body font-button text-on-accent" to={`/workflows/${workflow.id}/versions/${number}`}>Review all of it</Link>
          )}
        </div>
      </div>
    </Modal>
  )
}
