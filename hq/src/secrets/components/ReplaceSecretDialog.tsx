import { useState } from 'react'
import { replacePlaceSecret, useAction } from 'wasp/client/operations'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import type { SecretsPlace } from '../pages/secretsTypes'
import { SecretValueFields, type SecretInput } from './SecretValueFields'
import { ShowAttention } from '@agenthix/ui/attention'

/** Replace a secret's value (S2: it is never shown, only replaced). The next run uses the new one. */
export function ReplaceSecretDialog({ open, onClose, place, name }: { open: boolean; onClose: () => void; place: SecretsPlace; name: string }) {
  const replace = useAction(replacePlaceSecret)
  const [value, setValue] = useState<SecretInput | null>(null)
  const [rotateBy, setRotateBy] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async () => {
    setTried(true)
    if (!value) return
    setBusy(true)
    setError(null)
    try {
      await replace({ place, name, value, rotateBy: rotateBy || null })
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Replace ${name}`}>
      <form className="max-h-[70vh] space-y-4 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); void submit() }} data-testid="replace-secret-dialog">
        <p className="text-small text-text-secondary">The next run uses the new value. Its name, description and record stay.</p>
        <SecretValueFields name={name} onChange={setValue} error={tried && !value ? 'Type the value or choose a file.' : undefined} />
        <FormField label="Rotate by" htmlFor="replace-rotate" hint="Optional. Without one, it has no date.">
          <Input id="replace-rotate" type="date" value={rotateBy} onChange={(e) => setRotateBy(e.target.value)} />
        </FormField>
        <ShowAttention text={error} title="The secret was not replaced" onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Replace</Button>
        </div>
      </form>
    </Modal>
  )
}
