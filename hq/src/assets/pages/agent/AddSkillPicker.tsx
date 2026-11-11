import { useState } from 'react'
import { Link } from 'react-router'
import { SearchField, FOCUS_RING } from '@agenthix/ui/primitives'
import { LIBRARY_ADD_PATH } from '../../../library/components/libraryRoutes'
import type { AgentSkillLine } from './types'

/**
 * Add a skill: the installed skills this agent doesn't have, searched. Something not installed yet is added to the
 * Library first, through its install check, and then given to the agent here.
 */
export function AddSkillPicker({ agentName, options, busy, onAdd }: {
  agentName: string
  options: AgentSkillLine[]
  busy: boolean
  onAdd: (assetId: string) => void
}) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = options.filter(o => !q || `${o.title} ${o.identity} ${o.description}`.toLowerCase().includes(q))
  return (
    <div className="mt-2 rounded-lg border border-border-subtle p-2" data-testid="add-skill-picker">
      <SearchField label="Search the Library's skills" value={search} onChange={setSearch} className="w-full" />
      <ul className="mt-1 max-h-60 divide-y divide-border-subtle overflow-y-auto">
        {shown.map(o => (
          <li key={o.assetId} className="flex items-center gap-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-text-primary">{o.title} <span className="text-small text-text-muted">{o.identity} {o.version}</span></p>
              {o.description && <p className="truncate text-small text-text-secondary">{o.description}</p>}
            </div>
            <button type="button" disabled={busy} onClick={() => onAdd(o.assetId)} className={`rounded shrink-0 text-small font-medium text-link not-disabled:hover:underline disabled:opacity-40 ${FOCUS_RING}`}>
              Give to {agentName}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="py-2 text-small text-text-muted">{options.length === 0 ? 'Every installed skill is already given to this agent.' : 'Nothing matches.'}</li>}
      </ul>
      <p className="mt-2 text-small text-text-muted">
        Not in the Library yet? <Link to={LIBRARY_ADD_PATH} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Add it to the Library</Link>, then give it here.
      </p>
    </div>
  )
}
