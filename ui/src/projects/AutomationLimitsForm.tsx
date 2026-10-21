import { useId, useState } from 'react'
import { AutomationSwitch } from './AutomationSwitch'
import { AUTOMATION_BUTTON } from './AutomationViewHeader'
import { NO_AUTOMATION_CHOICE, type AutomationChoice, type AutomationRunLimits, type AutomationStatusView } from './AutomationTypes'

/**
 * Editing a project's limits in the Rules view: throttle, chain depth, queue
 * limit and turn limit. An empty field takes the organisation's value, and a
 * project may only be stricter. The draft is taken once, when editing starts,
 * so a refetch (on window focus, say) never throws away an edit not yet saved.
 */

export interface AutomationLimitsDraft {
  choice: AutomationChoice
  turnLimit: number | null
}

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
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={INPUT}
      />
    </div>
  )
}

export function AutomationLimitsForm({ status, runLimits, onSave, onCancel }: {
  status: AutomationStatusView
  runLimits: AutomationRunLimits | undefined
  onSave: (draft: AutomationLimitsDraft) => Promise<void>
  onCancel: () => void
}) {
  const { org } = status
  const [draft, setDraft] = useState<AutomationLimitsDraft>(() => ({
    choice: status.choice ?? NO_AUTOMATION_CHOICE,
    turnLimit: runLimits?.own.turnLimit ?? null,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<AutomationChoice>) => setDraft(d => ({ ...d, choice: { ...d.choice, ...patch } }))
  const throttleOn = draft.choice.throttle || org.throttle

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-body text-text-primary">Throttle</div>
          <div className="text-small text-text-muted">
            {org.throttle ? 'Required by the organisation: queued tasks start only in rounds' : 'Start queued tasks only in rounds'}
          </div>
        </div>
        <AutomationSwitch label="Throttle" on={throttleOn} disabled={busy || org.throttle} onChange={v => set({ throttle: v })} />
      </div>
      {throttleOn && (
        <>
          <NumberRow
            label="Every (minutes)" hint={`Between rounds; the organisation's shortest is ${org.intervalMinutes}`}
            value={draft.choice.intervalMinutes} placeholder={String(org.intervalMinutes)} onChange={v => set({ intervalMinutes: v })}
          />
          <NumberRow
            label="At a time" hint={`Tasks per agent per round; the organisation's most is ${org.batchSize}`}
            value={draft.choice.batchSize} placeholder={String(org.batchSize)} onChange={v => set({ batchSize: v })}
          />
        </>
      )}
      <NumberRow
        label="Chain depth" hint={`How far work agents queue for each other may go; organisation max ${org.maxDepth}`}
        value={draft.choice.maxDepth} placeholder={String(org.maxDepth)} onChange={v => set({ maxDepth: v })}
      />
      <NumberRow
        label="Queue limit" hint={`Queued tasks agents may hold; organisation max ${org.queueLimit}`}
        value={draft.choice.queueLimit} placeholder={String(org.queueLimit)} onChange={v => set({ queueLimit: v })}
      />
      {runLimits && (
        <NumberRow
          label="Turn limit" hint={`For runs no person started; organisation max ${runLimits.org.turnLimit}`}
          value={draft.turnLimit} placeholder={String(runLimits.org.turnLimit)} onChange={v => setDraft(d => ({ ...d, turnLimit: v }))}
        />
      )}
      <p className="text-small text-text-muted">Leave a field empty to use the organisation's value.</p>
      {error && <p className="text-small text-danger">{error}</p>}
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
