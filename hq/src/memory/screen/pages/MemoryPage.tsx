import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery, getMemoryChoices } from 'wasp/client/operations'
import type { GetMemoryArgs, MemoryScopeValue } from '../../../shared/memory/protocol'
import { SettingsSubpage } from '../../../settings/pages/SettingsSubpage'
import { useIsAdmin } from '../../../shared/hooks/useIsAdmin'
import { MemoryList } from './MemoryList'
import { memoryPageStart } from './memoryPageStart'

const SCOPE_TABS: { scope: MemoryScopeValue; label: string; line: string }[] = [
  { scope: 'PERSON', label: 'About you', line: 'What every agent you work with knows about you. Yours to change; nobody else can read it.' },
  { scope: 'AGENT_PERSON', label: 'One agent, about you', line: 'What one agent has learned about you, for its work with you.' },
  { scope: 'AGENT_PLACE', label: 'One agent, in a place', line: 'What an agent has learned about a place, for the people who work there. A place’s admins curate it.' },
]
const SELECT = 'bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary'

/** Settings › Memory: the three scopes, one at a time (memory and knowledge spec, The two kinds). */
export function MemoryPage() {
  const [params] = useSearchParams()
  const start = memoryPageStart(params)
  const [scope, setScope] = useState<MemoryScopeValue>(start.scope)
  const [agentId, setAgentId] = useState(start.agentId)
  const [placeKey, setPlaceKey] = useState(start.placeKey)
  const { data: choices } = useQuery(getMemoryChoices)
  const isAdmin = useIsAdmin()

  const place = choices?.places.find(p => `${p.type}:${p.id}` === (placeKey || `${choices.places[0]?.type}:${choices.places[0]?.id}`))
  const active = SCOPE_TABS.find(t => t.scope === scope)!
  let args: GetMemoryArgs | null = null
  if (scope === 'PERSON') args = { scope }
  else if (agentId && scope === 'AGENT_PERSON') args = { scope, agentId }
  else if (agentId && place && scope === 'AGENT_PLACE') args = { scope, agentId, place: { type: place.type, id: place.id } }

  return (
    <SettingsSubpage title="Memory">
      <h1 className="text-h2 font-semibold text-text-primary">Memory</h1>
      <div role="tablist" aria-label="Whose memory" className="mt-4 flex flex-wrap gap-2">
        {SCOPE_TABS.map(t => (
          <button key={t.scope} role="tab" type="button" aria-selected={scope === t.scope} onClick={() => setScope(t.scope)}
            className={`px-3 py-1.5 rounded-lg text-body cursor-pointer ${scope === t.scope ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-3 mb-4 text-small text-text-secondary">{active.line}</p>

      {scope !== 'PERSON' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <select aria-label="Agent" value={agentId} onChange={e => setAgentId(e.target.value)} className={SELECT}>
            <option value="">Choose an agent</option>
            {choices?.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {scope === 'AGENT_PLACE' && (
            <select aria-label="Place" value={place ? `${place.type}:${place.id}` : ''} onChange={e => setPlaceKey(e.target.value)} className={SELECT}>
              {choices?.places.map(p => <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}

      {args ? <MemoryList key={JSON.stringify(args)} scope={args} /> : <p className="text-body text-text-muted">Choose an agent to see what it remembers.</p>}

      {isAdmin && (
        <p className="mt-8 text-small text-text-muted">
          How well recall works, and the model that reads memory, are under{' '}
          <Link to="/admin/settings/memory" className="text-accent hover:text-accent-hover">Manage organisation › Settings › Memory</Link>.
        </p>
      )}
    </SettingsSubpage>
  )
}
