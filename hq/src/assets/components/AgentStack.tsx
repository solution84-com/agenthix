import { Plus, Users } from 'lucide-react'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'

export type StackAgent = { id: string; name: string; avatarUrl?: string | null }

export type AgentStackProps = {
  /** Every agent has it (a Library skill set to every agent, or a built-in that is on). */
  everyAgent: boolean
  /** A built-in an administrator switched off: the group avatar, greyed and struck through. */
  switchedOff?: boolean
  /** The agents that have it, when not every agent; the first two are drawn. */
  agents: StackAgent[]
  /** How many agents have it in all, when more are known than `agents` holds. */
  total?: number
}

const RING = 'ring-2 ring-surface-1'
const ROUND = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full'

/** Words for the stack, for its tooltip and for screen readers. */
export function agentStackWords({ everyAgent, switchedOff, agents, total }: AgentStackProps): string {
  if (switchedOff) return 'Switched off: no agent uses it'
  if (everyAgent) return 'Every agent uses it'
  const count = total ?? agents.length
  if (count === 0) return 'No agent uses it'
  if (count === 1) return `Used by ${agents[0]?.name ?? '1 agent'}`
  if (count === 2 && agents.length >= 2) return `Used by ${agents[0].name} and ${agents[1].name}`
  return `Used by ${count} agents`
}

/**
 * Who uses something, as avatars (owner's area 8 walk, finding 4): up to two agents, then a +N avatar; every agent as
 * one group avatar; none as a dashed +. Drawing only: the caller makes it a button or a link.
 */
export function AgentStack(props: AgentStackProps) {
  const { everyAgent, switchedOff, agents, total } = props
  const words = agentStackWords(props)
  if (everyAgent || switchedOff) {
    return (
      <span title={words} aria-label={words} role="img" className={`${ROUND} relative bg-chip text-text-primary ${switchedOff ? 'opacity-40' : ''}`}>
        <Users size={13} aria-hidden />
        {switchedOff && <span aria-hidden className="absolute h-0.5 w-6 -rotate-45 rounded bg-text-muted" />}
      </span>
    )
  }
  const count = total ?? agents.length
  if (count === 0) {
    return (
      <span title={words} aria-label={words} role="img" className={`${ROUND} border border-dashed border-border-strong text-text-secondary`}>
        <Plus size={13} aria-hidden />
      </span>
    )
  }
  const shown = agents.slice(0, 2)
  const rest = count - shown.length
  return (
    <span title={words} aria-label={words} role="img" className="flex items-center">
      {shown.map((a, i) => (
        <span key={a.id} className={`rounded-full ${RING} ${i > 0 ? '-ml-1.5' : ''}`}><AuthedAgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="sm" /></span>
      ))}
      {rest > 0 && <span className={`${ROUND} ${RING} -ml-1.5 bg-surface-2 text-micro font-medium text-text-secondary`}>+{rest}</span>}
    </span>
  )
}
