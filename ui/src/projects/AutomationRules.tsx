import { useState, type ReactNode } from 'react'
import { AutomationSwitch } from './AutomationSwitch'
import { AutomationHeading, AutomationViewHeader } from './AutomationViewHeader'
import { AutomationLimitsForm, type AutomationLimitsDraft } from './AutomationLimitsForm'
import { NO_AUTOMATION_CHOICE, type AutomationChoice, type AutomationRunLimits, type AutomationStatusView } from './AutomationTypes'

/**
 * The Automation tool's Rules view (every screen reviewed spec §3): the
 * agents' switch; the limits, each with the organisation's maximum, which a
 * project admin edits; the run time limit, read-only because it applies to
 * every run and is set in the project's Settings; then the columns that start
 * work automatically — only those switched on, each board a link. The switch
 * itself stays on the board's column.
 */

export interface AutomationRulesProps {
  status: AutomationStatusView
  runLimits: AutomationRunLimits | undefined
  /** Only a project's admins change the rules; everyone else reads them. */
  canEdit: boolean
  onSaveChoice: (choice: AutomationChoice) => Promise<void>
  onSaveLimits: (draft: AutomationLimitsDraft) => Promise<void>
  columns: Array<{ boardId: string; name: string; columns: string[] }> | undefined
  renderBoardLink: (boardId: string, children: ReactNode) => ReactNode
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
  const { org, effective } = status
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const limited = (flag: boolean) => (flag ? 'limited by the organisation' : undefined)

  const setAgentSchedules = async (on: boolean) => {
    setBusy(true)
    setError('')
    try {
      await props.onSaveChoice({ ...(status.choice ?? NO_AUTOMATION_CHOICE), agentSchedules: on })
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
            <div className={`text-small ${org.agentSchedules ? 'text-text-muted' : 'text-warning'}`}>
              {org.agentSchedules ? 'Only in a run a person started' : 'The organisation does not allow it'}
            </div>
          </div>
          <AutomationSwitch
            label="Agents may set start times when asked"
            on={status.choice?.agentSchedules ?? false}
            disabled={!canEdit || busy || (!org.agentSchedules && !status.choice?.agentSchedules)}
            onChange={v => void setAgentSchedules(v)}
          />
        </div>
        {error && <p className="mt-1 text-small text-danger">{error}</p>}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <AutomationHeading>Limits</AutomationHeading>
          {canEdit && !editing && (
            <button type="button" className="mb-2 text-small text-accent hover:underline" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
        {editing ? (
          <AutomationLimitsForm
            status={status}
            runLimits={runLimits}
            onCancel={() => setEditing(false)}
            onSave={async draft => {
              await props.onSaveLimits(draft)
              setEditing(false)
            }}
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            <LimitRow
              label="Throttle"
              value={effective.throttle ? `Every ${effective.intervalMinutes} min · ${effective.batchSize} at a time` : 'Off'}
              org={org.throttle ? 'required by the organisation' : undefined}
              warn={limited(effective.limitedByOrg.intervalMinutes || effective.limitedByOrg.batchSize)}
            />
            <LimitRow label="Chain depth" value={String(effective.maxDepth)} org={`org max ${org.maxDepth}`} warn={limited(effective.limitedByOrg.maxDepth)} />
            <LimitRow label="Queue limit" value={String(effective.queueLimit)} org={`org max ${org.queueLimit}`} warn={limited(effective.limitedByOrg.queueLimit)} />
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

      <section>
        <AutomationHeading>Columns that start work automatically</AutomationHeading>
        {!props.columns ? (
          <p className="text-small text-text-muted">Loading…</p>
        ) : props.columns.length === 0 ? (
          <p className="text-body text-text-secondary">No column starts work automatically.</p>
        ) : (
          <ul className="space-y-1" data-testid="automation-columns">
            {props.columns.map(b => (
              <li key={b.boardId} className="text-body text-text-primary">
                {props.renderBoardLink(b.boardId, b.name)} <span className="text-text-secondary">— {b.columns.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-small text-text-muted">
          Only the columns switched on are listed. Each is switched on its board's column, where tasks move.
        </p>
      </section>
    </div>
  )
}

