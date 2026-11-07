import { getModelPickerChoices, useQuery } from 'wasp/client/operations'
import { ModelPicker } from '../../shared/components/models/ModelPicker'

/** Empty follows the agent's default worker model, else the organisation's; the choices do not say which model that is. */
const DEFAULT = { value: '', setBy: 'the agent or the organisation' }

/**
 * The model a task or a routine names for its runs (models from one place, part 4). Empty follows the agent's default
 * worker model, else the organisation's. It offers what every list applying in the project allows, with a provider
 * that is not working greyed out; the server checks the pick again when a run starts.
 */
export function TaskModelField({ projectId, agentId, value, onChange, disabled }: {
  projectId: string
  agentId?: string | null
  /** A picker value (`<providerId>/<model>`), or '' to follow the default. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { data } = useQuery(getModelPickerChoices, { projectId, agentId: agentId ?? null })
  return (
    <div>
      <span className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Model</span>
      <ModelPicker field choices={data} value={value} onChange={onChange} defaultRow={DEFAULT} ariaLabel="Model" disabled={disabled}
        labelOf={() => 'A model that is no longer offered'} />
    </div>
  )
}
