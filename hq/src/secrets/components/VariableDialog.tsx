import { useState } from 'react'
import { addPlaceVariable, editPlaceVariable, useAction } from 'wasp/client/operations'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { ErrorLine } from '../../workflows/components/ErrorLine'
import { nameProblem } from '../pages/secretsWords'
import type { SecretsPlace } from '../pages/secretsTypes'

/**
 * Add or edit a variable. A value that looks like a secret is held back with a question: add it under Secrets
 * instead, or say it isn't one and save it as it is.
 */
export function VariableDialog({ open, onClose, place, editing, onMoveToSecrets }: {
  open: boolean
  onClose: () => void
  place: SecretsPlace
  /** The variable being edited, or undefined to add one. */
  editing?: { name: string; value: string }
  onMoveToSecrets: (name: string) => void
}) {
  const add = useAction(addPlaceVariable)
  const edit = useAction(editPlaceVariable)
  const [name, setName] = useState(editing?.name ?? '')
  const [value, setValue] = useState(editing?.value ?? '')
  const [question, setQuestion] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const problem = editing ? null : nameProblem(name)
  const save = async (notASecret: boolean) => {
    setTried(true)
    if (problem) return
    setBusy(true)
    setError(null)
    try {
      const saved = await (editing ? edit : add)({ place, name, value, notASecret })
      if (saved.saved) onClose(); else setQuestion(saved.question)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add a variable'} maxWidth="max-w-md">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(false) }} data-testid="variable-dialog">
        <FormField label="Name" htmlFor="variable-name" hint="Capitals, digits and _." error={tried && problem ? problem : undefined}>
          <Input id="variable-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!editing} autoComplete="off" placeholder="STAGING_HOST" />
        </FormField>
        <FormField label="Value" htmlFor="variable-value" hint="Shown to everyone in the place and to agents. Never put a secret here.">
          <Input id="variable-value" value={value} onChange={(e) => { setValue(e.target.value); setQuestion(null) }} autoComplete="off" />
        </FormField>
        {question && (
          <div role="alert" className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-small text-text-primary" data-testid="looks-like-secret">
            <p>{question}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => onMoveToSecrets(name)}>Add it under Secrets</Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void save(true)}>It isn't a secret: save it</Button>
            </div>
          </div>
        )}
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}
