import { AgentPicker } from '../../../conversations/components/AgentPicker'
import { ASK_WHERE, type useAskAgent } from './askAgent'

/** Who will answer and where, said before anything is sent, with the agent as a picker to choose another (finding 14). */
export function AskWho({ asking, disabled = false }: { asking: ReturnType<typeof useAskAgent>; disabled?: boolean }) {
  if (asking.unavailable) return <p role="alert" className="text-small text-danger">{asking.unavailable}</p>
  if (!asking.agent) return <p className="text-small text-text-muted">Finding who will answer…</p>
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-secondary">
      <span data-testid="ask-who">{asking.agent.name} will answer, in a new conversation in {ASK_WHERE}.</span>
      <span className="inline-flex items-center gap-1">
        Ask another agent:
        <AgentPicker agents={asking.choices} selectedId={asking.agent.id} onSelect={asking.pick} disabled={disabled} />
      </span>
    </div>
  )
}
