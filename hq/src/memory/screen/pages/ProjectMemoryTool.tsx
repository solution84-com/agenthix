import { useState } from 'react'
import { useQuery, getMemoryChoices } from 'wasp/client/operations'
import { MemoryList } from './MemoryList'
import { NativeSelect } from '@agenthix/ui/primitives'

/** A project's admins curate what an agent remembers there (the agent × place scope). */
export function ProjectMemoryTool({ projectId }: { projectId: string }) {
  const { data: choices } = useQuery(getMemoryChoices)
  const [agentId, setAgentId] = useState('')
  return (
    <div className="p-4 space-y-3">
      <p className="text-small text-text-secondary">What an agent has learned about this project, for everyone who works here. Its admins curate it.</p>
      <NativeSelect aria-label="Agent" value={agentId} onChange={e => setAgentId(e.target.value)} className="w-64">
        <option value="">Choose an agent</option>
        {choices?.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </NativeSelect>
      {agentId
        ? <MemoryList key={agentId} scope={{ scope: 'AGENT_PLACE', agentId, place: { type: 'project', id: projectId } }} />
        : <p className="text-body text-text-muted">Choose an agent to see what it remembers here.</p>}
    </div>
  )
}
