import type { ModelChoices } from '../../shared/conversations/protocol'
import type { DefaultRow } from '../../shared/components/models/ModelList'

/**
 * A conversation's default row: the model it talks on unless one is picked, which is the agent's default, else the
 * organisation's. The choices do not say which of the two set it, so the row names both.
 */
export function defaultRowOf(choices: ModelChoices | undefined, agentName?: string): DefaultRow | undefined {
  const model = choices?.recommended?.[0]
  if (!model) return undefined
  return { model: model.label, value: model.value, setBy: `${agentName ?? 'the agent'} or the organisation` }
}
