import { useState, type ReactNode } from 'react'
import { useAction, useQuery, getModelChoices, setConversationModel } from 'wasp/client/operations'
import { actionErrorText } from '../hooks/threadState'
import { ModelPicker } from '../../shared/components/models/ModelPicker'
import { defaultRowOf } from './conversationDefault'
import { ThreadFailure } from './ThreadFailure'

/**
 * The model's quiet button in a conversation, after the agent's name as plain text: changes it at any time, and the
 * server writes the quiet line the thread already draws. A refused change says why, as a line in the thread.
 */
export function ConversationModelPicker({ conversationId, model, agentName, agentAvatar, disabled, above }: {
  conversationId: string
  model: string | null
  /** The agent's name, plain text before the button; the agent cannot change once a conversation has started. */
  agentName?: string
  /** The agent's face before its name, where it is not already beside the line. */
  agentAvatar?: ReactNode
  disabled?: boolean
  /** Opens the list above the button, for one at the bottom of the screen. */
  above?: boolean
}) {
  const { data: choices } = useQuery(getModelChoices, { conversationId })
  const change = useAction(setConversationModel)
  const [error, setError] = useState('')
  const [tried, setTried] = useState<string | null>(null)
  const value = choices?.current ?? model ?? ''

  const onChange = async (next: string) => {
    if (next === value) return
    setError('')
    setTried(next)
    try {
      await change({ conversationId, model: next })
    } catch (err) {
      setError(actionErrorText(err, 'Could not change the model'))
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className="flex min-w-0 items-center gap-1">
        {agentName && (
          <span className="flex min-w-0 items-center gap-1.5 px-2 text-small text-text-muted">
            {agentAvatar}
            <span className="truncate">{agentName}</span>
          </span>
        )}
        <ModelPicker quiet choices={choices} value={value} defaultRow={defaultRowOf(choices, agentName)} onChange={(m) => void onChange(m)}
          disabled={disabled} above={above} ariaLabel="Model" />
      </div>
      <ThreadFailure text={error} title="The model was not changed" retry={tried ? () => void onChange(tried) : undefined} onClose={() => setError('')} />
    </div>
  )
}
