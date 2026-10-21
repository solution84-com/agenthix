import { useState } from 'react'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import type { NarrowingData, ProjectAgentDetailData } from './projectAgentTypes'
import type { AgentOverrideModelOption } from './AgentOverrideForm'

const LEGEND = 'text-micro font-medium uppercase tracking-wide text-text-muted'
const OPTION = 'flex cursor-pointer items-start gap-2 rounded-lg border border-border-subtle px-3 py-2 text-small has-[:checked]:border-accent has-[:checked]:bg-accent-subtle'

/**
 * "In this project", edited in place: the model. What the agent may do here is Permissions here, which is not part
 * of this form, so a save keeps what the narrowing already holds.
 */
export function ProjectAgentEdit({ detail, modelOptions, modelLabel, onSave, onCancel }: {
  detail: ProjectAgentDetailData
  modelOptions: readonly AgentOverrideModelOption[]
  modelLabel: (id: string, runtime: string) => string
  onSave: (next: NarrowingData) => Promise<void>
  onCancel: () => void
}) {
  const { own, narrowing } = detail.inThisProject
  const [model, setModel] = useState(narrowing?.model ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave({
        model: model || null,
        approval: narrowing?.approval ?? null,
        allowedTools: narrowing?.allowedTools ?? null,
        allowedBashPatterns: narrowing?.allowedBashPatterns ?? null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <ViewHeaderRow><PanelHeaderContent back={detail.agent.name} onBack={onCancel} title="In this project" /></ViewHeaderRow>
      <p className="pt-4 text-small text-text-muted">
        Every run here gets this model. It changes nothing outside this project.
      </p>

      <fieldset className="space-y-1.5">
        <legend className={LEGEND}>Model</legend>
        <label className={OPTION}>
          <input type="radio" name="model" checked={model === ''} onChange={() => setModel('')} />
          <span>Its own <small className="text-text-muted">{modelLabel(own.model, detail.agent.runtime)}</small></span>
        </label>
        {modelOptions.filter(m => m.value !== own.model).map(m => (
          <label key={m.value} className={`${OPTION} ${m.disabledReason ? 'opacity-50' : ''}`} title={m.disabledReason ?? undefined}>
            <input type="radio" name="model" checked={model === m.value} disabled={!!m.disabledReason} onChange={() => setModel(m.value)} />
            <span>{m.label}{m.disabledReason && <small className="text-text-muted"> · {m.disabledReason}</small>}</span>
          </label>
        ))}
      </fieldset>

      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={TASK_BUTTON_PRIMARY} disabled={busy} onClick={() => void save()}>Save</button>
        <button type="button" className={TASK_BUTTON} onClick={onCancel}>Cancel</button>
      </div>
      <p className="text-micro text-text-muted">Every member sees this; only this project&apos;s admins can change it.</p>
    </div>
  )
}
