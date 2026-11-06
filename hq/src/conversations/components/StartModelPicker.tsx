import { useQuery, getModelChoices } from 'wasp/client/operations'
import { ModelPicker } from '../../shared/components/models/ModelPicker'
import { defaultRowOf } from './conversationDefault'

/** The model's quiet button before a conversation's first message; `picked` null is the policy's talking model. */
export function StartModelPicker({ home, projectId, picked, onPick, disabled }: {
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  picked: string | null
  onPick: (model: string) => void
  disabled?: boolean
}) {
  const { data: choices } = useQuery(getModelChoices, { home, projectId })
  return (
    <ModelPicker quiet choices={choices} value={picked ?? choices?.current ?? ''} defaultRow={defaultRowOf(choices)} onChange={onPick}
      disabled={disabled} above ariaLabel="Model" />
  )
}
