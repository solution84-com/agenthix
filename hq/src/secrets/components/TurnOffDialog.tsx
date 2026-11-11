import { useState } from 'react'
import { turnOffWhatUsesIt, useAction } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import type { SecretsPlace, TurnedOffView, UsingWorkflowView, ValueKind } from '../pages/secretsTypes'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Turn off what uses it (S7): lists the workflows that are on and says a run in progress is stopped, then, once done,
 * says what to do next. Revoking is one action.
 */
export function TurnOffDialog({ open, onClose, place, kind, name, usedBy }: {
  open: boolean
  onClose: () => void
  place: SecretsPlace
  kind: ValueKind
  name: string
  usedBy: UsingWorkflowView[]
}) {
  const turnOff = useAction(turnOffWhatUsesIt)
  const on = usedBy.filter((w) => w.enabled)
  const [done, setDone] = useState<TurnedOffView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try { setDone(await turnOff({ place, kind, name })) } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={done ? `Turned off what uses ${name}` : `Turn off what uses ${name}?`} maxWidth="max-w-md">
      <div className="space-y-4" data-testid="turn-off-dialog">
        {done ? (
          <>
            <p className="text-small text-text-secondary">
              {done.workflows.length === 0 ? 'No workflow that uses it was on.' : `Turned off: ${done.workflows.map((w) => w.name).join(', ')}.`}
              {done.runsStopped > 0 && ` ${done.runsStopped} ${done.runsStopped === 1 ? 'run' : 'runs'} in progress stopped.`}
            </p>
            <p className="text-small text-text-primary">{done.next}</p>
            <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
          </>
        ) : (
          <>
            <p className="text-small text-text-secondary">For when it may have leaked. These workflows are turned off now, and a run in progress is stopped:</p>
            {on.length === 0
              ? <p className="rounded-lg border border-border bg-card px-3 py-2 text-small text-text-muted">No workflow that uses it is on.</p>
              : <ul className="space-y-1.5">{on.map((w) => <li key={w.id} className="rounded-lg border border-border bg-card px-3 py-2 text-small text-text-primary">{w.name}</li>)}</ul>}
            <ShowAttention kind="alert" text={error} title="The workflows were not turned off" onClose={() => setError(null)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button variant="danger" disabled={busy || on.length === 0} onClick={() => void confirm()}>
                {on.length === 1 ? 'Turn off 1 workflow' : `Turn off ${on.length} workflows`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
