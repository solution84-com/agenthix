import { useEffect, useState } from 'react'
import { useQuery, useAction, getOrgAutomation, updateOrgAutomation } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'

interface OrgAutomation {
  agentSchedules: boolean
  maxDepth: number
}

const INPUT = 'w-40 bg-surface-2 border border-border rounded-lg px-3 py-2 text-text-primary text-body focus:outline-none focus:border-accent'

function Toggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-text-primary text-body">{label}</div>
        <div className="text-text-muted text-small mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${value ? 'bg-accent' : 'bg-surface-3'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-text-primary transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function NumberRow({ label, description, value, onChange }: {
  label: string; description: string; value: number; onChange: (v: number) => void
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <div>
        <div className="text-text-primary text-body">{label}</div>
        <div className="text-text-muted text-small mt-0.5">{description}</div>
      </div>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} className={INPUT} />
    </label>
  )
}

/**
 * The organisation's limits on what agents may start (adr-0175, adr-0091). Work
 * starts only by an explicit act, so these are all that is left to set.
 */
export function AutomationSettingsPage() {
  return (
    <OrgAdminPage area="settings" title="Automation">
      <OrgAdminHeading title="Automation">
        Work starts only when someone starts it. These limit what agents may start for the people they work for.
      </OrgAdminHeading>
      <OrgAutomationForm />
    </OrgAdminPage>
  )
}

function OrgAutomationForm() {
  const { data: current } = useQuery(getOrgAutomation)
  const save = useAction(updateOrgAutomation)
  const [draft, setDraft] = useState<OrgAutomation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (current) setDraft(current as OrgAutomation) }, [current])

  const set = (patch: Partial<OrgAutomation>) => setDraft(d => (d ? { ...d, ...patch } : d))
  const handleSave = async () => {
    if (!draft) return
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await save(draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  if (!draft) return null
  return (
    <div className="space-y-5">
      <NumberRow
        label="Maximum depth"
        description="How far a chain of work agents start for each other may go before a person must start the next step."
        value={draft.maxDepth}
        onChange={v => set({ maxDepth: v })}
      />
      <Toggle
        label="Agents may set start times when asked"
        description="Allows projects to let an agent set a task's start time, only in a run a person started."
        value={draft.agentSchedules}
        onChange={v => set({ agentSchedules: v })}
      />
      {error && <div className="text-body text-danger">{error}</div>}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="px-4 py-2 text-body font-medium bg-accent hover:bg-accent-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors"
      >
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
