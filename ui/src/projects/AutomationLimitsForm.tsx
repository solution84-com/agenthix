import { useId, useState } from 'react'
import { AUTOMATION_BUTTON } from './AutomationViewHeader'
import type { AutomationRunLimits } from './AutomationTypes'
import { FIELD } from '../primitives/controlStyles'
import { BUTTON_PRIMARY } from '../primitives/buttonStyles'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/**
 * Editing a project's turn limit in the Rules view. An empty field takes the
 * organisation's value, and a project may only be stricter. The draft is taken
 * once, when editing starts, so a refetch (on window focus, say) never throws
 * away an edit not yet saved.
 */

const INPUT =
  `${FIELD} w-24 rounded-lg px-2.5 py-1 text-body`

function NumberRow({ label, hint, value, placeholder, onChange, error }: {
  label: string; hint: string; value: number | null; placeholder: string; onChange: (v: number | null) => void; error?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-body text-text-primary">{label}</span>
        <span className="block text-small text-text-muted">{hint}</span>
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={INPUT}
        aria-invalid={error ? true : undefined}
      />
      {error && <p role="alert" className="basis-full text-small text-danger">{error}</p>}
    </div>
  )
}

export function AutomationLimitsForm({ runLimits, onSave, onCancel }: {
  runLimits: AutomationRunLimits
  onSave: (turnLimit: number | null) => Promise<void>
  onCancel: () => void
}) {
  const [turnLimit, setTurnLimit] = useState<number | null>(() => runLimits.own.turnLimit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [fieldError, setFieldError] = useState('')

  const save = async () => {
    if (turnLimit !== null && (!Number.isInteger(turnLimit) || turnLimit < 0)) {
      setFieldError('The turn limit is a whole number, 0 or more, or empty. Nothing was changed.')
      return
    }
    setBusy(true)
    setFieldError('')
    setError('')
    try {
      await onSave(turnLimit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <NumberRow
        label="Turn limit" hint={`For runs no person started; organisation max ${runLimits.org.turnLimit}`}
        value={turnLimit} placeholder={String(runLimits.org.turnLimit)} onChange={v => { setTurnLimit(v); setFieldError('') }} error={fieldError}
      />
      <p className="text-small text-text-muted">Leave it empty to use the organisation's value.</p>
      {errorDialog}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className={`rounded-lg px-3 py-1 text-small font-medium ${BUTTON_PRIMARY}`}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={AUTOMATION_BUTTON}>Cancel</button>
      </div>
    </div>
  )
}
