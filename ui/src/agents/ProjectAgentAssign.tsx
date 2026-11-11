import { useState, type ReactNode } from 'react'
import { SearchField } from '../primitives/FilterControls'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'
import { TASK_BUTTON } from '../tasks/TasksToolParts'
import { LinkButton, type RenderAgentAvatar } from './ProjectAgentParts'
import type { AgentFactsData } from './projectAgentTypes'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/** Assign, in place: the organisation's agents that are not in the project yet, with their role. */
export function ProjectAgentAssign({ candidates, alreadyHere, renderAvatar, onAssign, onBack, onMakeAgent, backLabel = 'Agents' }: {
  candidates: Pick<AgentFactsData, 'id' | 'name' | 'role' | 'avatarUrl'>[]
  alreadyHere: string[]
  renderAvatar: RenderAgentAvatar
  onAssign: (agentId: string) => Promise<void>
  onBack: () => void
  /** The view this goes back to: "Agents", or "Members" where agents are one part of a project's members. */
  backLabel?: string
  /** Absent where the person may not make agents. */
  onMakeAgent?: () => void
}) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })
  const shown = candidates.filter(a => `${a.name} ${a.role ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  const assign = async (id: string) => {
    setBusyId(id)
    setError('')
    try {
      await onAssign(id)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign it')
      setBusyId(null)
    }
  }

  let list: ReactNode
  if (candidates.length === 0) list = <p className="text-small text-text-muted">Every agent in the organisation is here already.</p>
  else if (shown.length === 0) list = <p className="text-small text-text-muted">No agent matches.</p>
  else {
    list = (
      <ul className="space-y-2">
        {shown.map(a => (
          <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2">
            <span className="shrink-0">{renderAvatar({ id: a.id, name: a.name, avatarUrl: a.avatarUrl }, 'md')}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-body font-medium text-text-primary">{a.name}</b>
              {a.role && <span className="block truncate text-small text-text-muted">{a.role}</span>}
            </span>
            <button type="button" className={TASK_BUTTON} disabled={busyId !== null} aria-label={`Assign ${a.name}`} onClick={() => void assign(a.id)}>Assign</button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-3 px-4 pb-6">
      <ViewHeaderRow><PanelHeaderContent back={backLabel} onBack={onBack} title="Assign an agent" /></ViewHeaderRow>
      <div className="pt-4"><SearchField label="Search the organisation's agents" value={query} onChange={setQuery} className="w-full" /></div>
      {errorDialog}
      {list}
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted">Already here · {alreadyHere.length}</p>
      <p className="text-small text-text-secondary">{alreadyHere.join(' · ') || 'None'}</p>
      {onMakeAgent && <p><LinkButton onClick={onMakeAgent}>Make a new agent under Agents ›</LinkButton></p>}
    </div>
  )
}
