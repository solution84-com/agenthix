import { useState } from 'react'
import { AutomationSwitch } from './AutomationSwitch'
import { AutomationHeading, AutomationViewHeader } from './AutomationViewHeader'
import { AutomationLimitsForm } from './AutomationLimitsForm'
import type { AutomationRunLimits, AutomationStatusView } from './AutomationTypes'
import { FOCUS_RING } from '../primitives/controlStyles'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/**
 * The Automation tool's Rules view (every screen reviewed spec §3): the
 * agents' switch; the limits — the chain depth, the organisation's; the turn
 * limit, which a project admin edits; the run time limit, read-only because it
 * applies to every run and is set in the project's Settings. No column, switch,
 * pulse, throttle or queue limit starts work (adr-0175), so none is here.
 */

export interface AutomationRulesProps {
  status: AutomationStatusView
  runLimits: AutomationRunLimits | undefined
  /** Only a project's admins change the rules; everyone else reads them. */
  canEdit: boolean
  onSaveAgentSchedules: (on: boolean) => Promise<void>
  onSaveTurnLimit: (turnLimit: number | null) => Promise<void>
  onBack: () => void
}

function LimitRow({ label, note, value, org, warn }: { label: string; note?: string; value: string; org?: string; warn?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 py-1.5">
      <div className="min-w-0">
        <span className="text-body text-text-primary">{label}</span>
        {note && <span className="block text-small text-text-muted">{note}</span>}
      </div>
      <div className="text-right">
        <span className="text-body font-medium text-text-primary">{value}</span>
        {(org || warn) && <span className={`block text-small ${warn ? 'text-warning' : 'text-text-muted'}`}>{warn ?? org}</span>}
      </div>
    </div>
  )
}

const effectiveLimit = (own: number | null, org: number) => Math.min(own ?? org, org)

export function AutomationRules(props: AutomationRulesProps) {
  const { status, runLimits, canEdit } = props
  const { org } = status
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  // The organisation forbids agent start times: the switch says so, and a press opens the reason.
  const refusal = !org.agentSchedules && !status.agentSchedules ? { reason: 'The organisation does not allow it.' } : undefined

  const setAgentSchedules = async (on: boolean) => {
    setBusy(true)
    setError('')
    try {
      await props.onSaveAgentSchedules(on)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <AutomationViewHeader title="Rules" onBack={props.onBack} />

      <section>
        <AutomationHeading>Agents</AutomationHeading>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-body text-text-primary">Agents may set start times when asked</div>
            <div className="text-small text-text-muted">Only in a run a person started</div>
          </div>
          <AutomationSwitch
            label="Agents may set start times when asked"
            on={status.agentSchedules}
            disabled={!canEdit || busy}
            refusal={refusal}
            onChange={v => void setAgentSchedules(v)}
          />
        </div>
        {errorDialog}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <AutomationHeading>Limits</AutomationHeading>
          {canEdit && runLimits && !editing && (
            <button type="button" className={`mb-2 text-small text-link hover:underline ${FOCUS_RING}`} onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
        {editing && runLimits ? (
          <AutomationLimitsForm
            runLimits={runLimits}
            onCancel={() => setEditing(false)}
            onSave={async turnLimit => {
              await props.onSaveTurnLimit(turnLimit)
              setEditing(false)
            }}
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            <LimitRow label="Chain depth" note="set by the organisation" value={String(org.maxDepth)} />
            {runLimits && (
              <>
                <LimitRow
                  label="Turn limit" note="runs no person started"
                  value={String(effectiveLimit(runLimits.own.turnLimit, runLimits.org.turnLimit))}
                  org={`org max ${runLimits.org.turnLimit}`}
                />
                <LimitRow
                  label="Run time limit" note="every run · set in project Settings"
                  value={`${effectiveLimit(runLimits.own.timeLimitMinutes, runLimits.org.timeLimitMinutes)} min`}
                />
              </>
            )}
          </div>
        )}
      </section>

    </div>
  )
}

