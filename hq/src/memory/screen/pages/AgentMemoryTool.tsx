import { Link } from 'react-router'
import { MemoryList } from './MemoryList'

/** What the agent remembers about the person, theirs alone: the agent place's Memory tool. */
export function AgentMemoryTool({ agentId, agentName }: { agentId: string; agentName: string }) {
  return (
    <div className="p-4 space-y-3">
      <p className="text-small text-text-secondary">
        What {agentName} remembers about you. Yours to change; nobody else can read it.{' '}
        <Link to="/settings/memory" className="text-accent hover:text-accent-hover">All your memory</Link>
      </p>
      <MemoryList scope={{ scope: 'AGENT_PERSON', agentId }} />
    </div>
  )
}
