import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery, getMemoryChoices } from 'wasp/client/operations'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { SettingsSubpage } from '../../../settings/pages/SettingsSubpage'
import { useIsAdmin } from '../../../shared/hooks/useIsAdmin'
import { NO_FILTER, argsOf, type MemoryFilter } from '../filters'
import { MemoryDialog } from './MemoryDialog'
import { MemoryFilters } from './MemoryFilters'
import { MemoryList } from './MemoryList'
import { memoryPageStart } from './memoryPageStart'

/**
 * Settings › Memory (ADR-0188, spec decision 11): everything agents remember about the person in one list, newest
 * first, every agent on equal terms, filtered by kind, agent, place, tag and words. `?item=<id>` opens that memory.
 */
export function MemoryPage() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<MemoryFilter>(() => ({ ...NO_FILTER, agent: memoryPageStart(params).agentId }))
  const [showArchived, setShowArchived] = useState(false)
  const choicesQuery = useQuery(getMemoryChoices)
  const readChoices = useBackgroundRead(choicesQuery, { what: 'The filters' })
  const isAdmin = useIsAdmin()
  const opened = params.get('item')

  const open = (id: string | null) => setParams(p => {
    const next = new URLSearchParams(p)
    if (id) next.set('item', id)
    else next.delete('item')
    return next
  }, { replace: !id })

  return (
    <SettingsSubpage title="Memory">
      <h1 className="text-h2 font-medium text-text-primary">Memory</h1>
      <p className="mt-3 mb-4 text-small text-text-secondary">
        What agents remember about you. Only you see it. Each agent keeps its own; you choose what every agent knows.
      </p>
      <div className="mb-4">
        <MemoryFilters filter={filter} onChange={setFilter} choices={choicesQuery.data} />
        {readChoices.nudge}
      </div>
      <MemoryList args={{ ...argsOf(filter), includeArchived: showArchived }} onOpen={open}
        empty={Object.keys(argsOf(filter)).length === 0 ? 'Nothing is remembered about you yet.' : 'No memory matches.'} />
      <label className="mt-4 flex items-center gap-2 text-small text-text-secondary">
        <input className="accent-accent" type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
        Show archived
      </label>

      {isAdmin && (
        <p className="mt-8 text-small text-text-muted">
          How well recall works, and the model that reads memory, are under{' '}
          <Link to="/admin/settings/memory" className={`rounded text-link hover:underline ${FOCUS_RING}`}>Manage organisation › Settings › Memory</Link>.
        </p>
      )}
      <MemoryDialog itemId={opened} onClose={() => open(null)} />
    </SettingsSubpage>
  )
}
