import { useState } from 'react'
import { addPlaceVariable, editPlaceVariable, useAction } from 'wasp/client/operations'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { nameProblem } from '../pages/secretsWords'
import type { SecretsPlace } from '../pages/secretsTypes'
import { ShowAttention } from '@agenthix/ui/attention'

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
        <ShowAttention kind="alert"
          text={question}
          title="This looks like a secret"
          actions={[{ label: 'Add it under Secrets', onClick: () => onMoveToSecrets(name), variant: 'primary' }, { label: "It isn't a secret: save it", onClick: () => void save(true) }]}
          onClose={() => setQuestion(null)}
        />
        <ShowAttention kind="alert" text={error} title="The variable was not saved" onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}
