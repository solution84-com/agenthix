import { useEffect, useState } from 'react'
import { useQuery, useAction, getOrgAutomation, updateOrgAutomation } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'

interface OrgAutomation {
  allowed: boolean
  intervalMinutes: number
  batchSize: number
  queueLimit: number
  agentSchedules: boolean
  throttle: boolean
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
 * The organisation's automation values (adr-0087). Each is both where every
 * project starts and the furthest any project may go; turning automation off
 * here stops every pulse and scheduled start in the organisation at once.
 */
export function AutomationSettingsPage() {
  return (
    <OrgAdminPage area="settings" title="Automation">
      <OrgAdminHeading title="Automation">
        What a project's pulse and schedules may do. Each value is where every project starts and the furthest
        any project may go — a project can only be stricter. Projects keep automation off until their admins turn it on.
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
      <Toggle
        label="Automation allowed"
        description="Off stops every pulse and scheduled start in the organisation at once; projects keep their own choices for when it is back on."
        value={draft.allowed}
        onChange={v => set({ allowed: v })}
      />
      <NumberRow
        label="Highest maximum depth"
        description="How far a chain of work agents queue for each other may go before a person must queue the next step. At 0, every task an agent queues outside a person's own run waits for a person."
        value={draft.maxDepth}
        onChange={v => set({ maxDepth: v })}
      />
      <Toggle
        label="Every project must throttle"
        description="On, every project's queued tasks start only in rounds. Off, each project chooses; the throttle is off unless a project turns it on."
        value={draft.throttle}
        onChange={v => set({ throttle: v })}
      />
      <NumberRow
        label="Shortest interval (minutes)"
        description="With the throttle on: the least time between the end of one round and the start of the next. At least 5."
        value={draft.intervalMinutes}
        onChange={v => set({ intervalMinutes: v })}
      />
      <NumberRow
        label="Largest batch"
        description="With the throttle on: the most tasks one round starts for one agent."
        value={draft.batchSize}
        onChange={v => set({ batchSize: v })}
      />
      <NumberRow
        label="Highest queue limit"
        description="The most tasks agents may hold queued in one project. People are never limited."
        value={draft.queueLimit}
        onChange={v => set({ queueLimit: v })}
      />
      <Toggle
        label="Agents may set schedules when asked"
        description="Allows projects to let an agent set a task's schedule, only in a run a person started."
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
