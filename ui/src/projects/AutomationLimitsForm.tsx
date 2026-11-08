import { useId, useState } from 'react'
import { AUTOMATION_BUTTON } from './AutomationViewHeader'
import type { AutomationRunLimits } from './AutomationTypes'

/**
 * Editing a project's turn limit in the Rules view. An empty field takes the
 * organisation's value, and a project may only be stricter. The draft is taken
 * once, when editing starts, so a refetch (on window focus, say) never throws
 * away an edit not yet saved.
 */

const INPUT =
  'w-24 rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-body text-text-primary focus:border-accent focus:outline-none disabled:opacity-60'

function NumberRow({ label, hint, value, placeholder, onChange }: {
  label: string; hint: string; value: number | null; placeholder: string; onChange: (v: number | null) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-3">
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
      />
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

  const save = async () => {
    if (turnLimit !== null && (!Number.isInteger(turnLimit) || turnLimit < 0)) {
      setError('The turn limit is a whole number, 0 or more, or empty. Nothing was changed.')
      return
    }
    setBusy(true)
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
        value={turnLimit} placeholder={String(runLimits.org.turnLimit)} onChange={setTurnLimit}
      />
      <p className="text-small text-text-muted">Leave it empty to use the organisation's value.</p>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-lg bg-accent px-3 py-1 text-small font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={AUTOMATION_BUTTON}>Cancel</button>
      </div>
    </div>
  )
}
