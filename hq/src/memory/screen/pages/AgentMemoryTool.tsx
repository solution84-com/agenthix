import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, getMemoryChoices } from 'wasp/client/operations'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { NO_FILTER, argsOf, type MemoryFilter } from '../filters'
import { MemoryDialog } from './MemoryDialog'
import { MemoryFilters } from './MemoryFilters'
import { MemoryRows } from './MemoryRows'
import { useMemoryItems } from './MemoryList'

/**
 * An agent's page › Memory (spec decision 5): what this agent remembers about the person, then, folded, what every
 * agent knows: together, everything this agent may recall about them. The same rows and dialog as the memory screen.
 */
export function AgentMemoryTool({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [filter, setFilter] = useState<MemoryFilter>(NO_FILTER)
  const [opened, setOpened] = useState<string | null>(null)
  const [unfolded, setUnfolded] = useState(false)
  const { data: choices } = useQuery(getMemoryChoices)
  const base = { ...argsOf(filter), includeArchived: false }
  const own = useMemoryItems({ ...base, agentId }, `What ${agentName} remembers`)
  const every = useMemoryItems({ ...base, agentId: null }, 'What every agent knows')
  const everyCount = every.items?.length ?? 0

  return (
    <div className="space-y-3 p-4">
      <p className="text-small text-text-secondary">
        What {agentName} remembers about you. Only you see it.{' '}
        <Link to="/settings/memory" className={`rounded text-link hover:underline ${FOCUS_RING}`}>All your memory ›</Link>
      </p>
      <MemoryFilters filter={filter} onChange={setFilter} choices={choices} menus={['place', 'tag']} />

      <h3 className="pt-1 text-small font-medium text-text-secondary">
        {agentName}'s own <span className="text-text-muted">{own.items?.length ?? ''}</span>
      </h3>
      {own.read.nudge}
      {own.isLoading ? <p className="text-body text-text-muted">Loading…</p>
        : own.read.failedWithoutData ? null
        : own.items?.length ? <MemoryRows items={own.items} onOpen={setOpened} />
        : <p className="text-body text-text-muted">{agentName} remembers nothing of its own about you{Object.keys(argsOf(filter)).length ? ' that matches' : ''}.</p>}

      <h3 className="pt-1 text-small font-medium text-text-secondary">
        <button type="button" aria-expanded={unfolded} onClick={() => setUnfolded(u => !u)}
          className={`rounded hover:text-text-primary ${FOCUS_RING}`}>
          {unfolded ? '▾' : '▸'} Also known to every agent <span className="text-text-muted">{every.items ? everyCount : ''}</span>
        </button>
      </h3>
      {unfolded && (
        <>
          {every.read.nudge}
          {every.isLoading ? <p className="text-body text-text-muted">Loading…</p>
            : every.read.failedWithoutData ? null
            : everyCount ? <MemoryRows items={every.items!} onOpen={setOpened} />
            : <p className="text-body text-text-muted">Nothing is known to every agent{Object.keys(argsOf(filter)).length ? ' that matches' : ''}.</p>}
        </>
      )}
      <MemoryDialog itemId={opened} onClose={() => setOpened(null)} fromOutside />
    </div>
  )
}
