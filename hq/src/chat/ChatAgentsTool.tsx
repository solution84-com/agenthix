import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getOrgAgents, getProjectAgents } from 'wasp/client/operations'
import { Button, CARD_CLICKABLE, PanelHeaderContent, ViewHeaderRow, FOCUS_RING } from '@agenthix/ui/primitives'
import { nowLine } from '@agenthix/ui/agents'
import { AuthedAgentAvatar } from '../shared/components/AuthedAgentAvatar'
import { AgentPermissionsHere } from '../agents/pages/AgentPermissionsHere'
import type { OrgAgentsView } from '../agents/agentPlaceQueries'
import type { ProjectAgentsView } from '../agents/projectAgentQueries'
import { AssignScreen, RemoveScreen } from '../projects/agents/AgentScreens'
import { useAgentsToolUrl } from '../projects/agents/useAgentsToolUrl'
import { ReadFailure } from '@agenthix/ui/attention'

const TONE = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' } as const

/** The place's roster: the agents its tasks and routines may be given to. Its owner adds and removes them. */
function AgentsList({ projectId, onOpen, onAdd, onRemove }: {
  projectId: string
  onOpen: (agentId: string) => void
  onAdd: () => void
  onRemove: (agentId: string) => void
}) {
  const { data, isLoading, error, refetch } = useQuery(getProjectAgents, { projectId })
  const view = data as ProjectAgentsView | undefined
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !view) return <ReadFailure what="The agents" retry={() => void refetch()} />
  const now = new Date()
  return (
    <div className="pb-6">
      <div className="flex items-start gap-3 px-4 pt-4">
        <p className="min-w-0 flex-1 text-small text-text-muted">
          Tasks and routines here are given to the agents on this list. You can talk to any agent in the organisation here, listed or not.
        </p>
        {view.canManage && (
          <Button type="button" variant="secondary" size="sm" onClick={onAdd} className="shrink-0">Add</Button>
        )}
      </div>
      {view.agents.length === 0 && <p className="px-4 pt-4 text-small text-text-muted">No agent is on this list yet, so no task here can be given to an agent.</p>}
      <ul className="space-y-2 px-4 pt-4">
        {view.agents.map(({ agent, now: state }) => {
          const line = nowLine(state, now)
          return (
            <li
              key={agent.id} onClick={() => onOpen(agent.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 ${CARD_CLICKABLE}`}
            >
              <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <button type="button" aria-label={`Open ${agent.name}`} className="block max-w-full truncate rounded text-left text-body font-medium text-text-primary">
                  {agent.name}{agent.role && <span className="ml-2 text-small font-normal text-text-muted">{agent.role}</span>}
                </button>
                <p className="truncate text-small text-text-secondary">
                  <span className={`font-medium ${TONE[line.tone]}`}>{line.label}</span>{line.detail && <> · {line.detail}</>}
                </p>
              </div>
              {view.canManage && (
                <button
                  type="button" aria-label={`Remove ${agent.name}`}
                  onClick={(e) => { e.stopPropagation(); onRemove(agent.id) }}
                  className="shrink-0 rounded text-small text-text-muted hover:text-danger"
                >
                  Remove
                </button>
              )}
              <span className="text-text-muted" aria-hidden>›</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** One agent in Chat's panel: your permissions for it in Chat. `focus` scrolls to them. */
function ChatAgent({ agentId, focus, onBack }: { agentId: string; focus: string | null; onBack: () => void }) {
  const { data: user } = useAuth()
  const { data: orgAgents } = useQuery(getOrgAgents, { filter: 'all' })
  const agent = (orgAgents as OrgAgentsView | undefined)?.agents.find(c => c.agent.id === agentId)?.agent
  const permissionsRef = useRef<HTMLDivElement>(null)
  const ready = !!agent && !!user
  useEffect(() => {
    if (!ready) return
    const target = focus === 'permissions' ? permissionsRef.current : null
    target?.scrollIntoView?.({ block: 'start' })
  }, [focus, ready])

  if (!agent || !user) {
    return (
      <div className="px-4 py-6 text-small text-text-muted">
        <ViewHeaderRow><PanelHeaderContent back="Agents" onBack={onBack} title="Agent" /></ViewHeaderRow>
        Loading…
      </div>
    )
  }
  return (
    <div className="pb-6">
      <ViewHeaderRow><PanelHeaderContent back="Agents" onBack={onBack} title={agent.name} /></ViewHeaderRow>
      <div className="flex items-center gap-3 px-4 pt-4">
        <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text-primary">{agent.name}</p>
          <p className="truncate text-small text-text-muted">{agent.role ? `${agent.role} · ` : ''}in your Chat</p>
        </div>
      </div>
      <div ref={permissionsRef} className="scroll-mt-12 px-4 pt-6">
        <AgentPermissionsHere
          agentId={agent.id} agentName={agent.name} boundaryType="user" boundaryId={user.id} title="Your permissions in Chat"
        />
        <p className="pt-3 text-micro text-text-muted">Only you see and change these, and they apply to runs in your Chat.</p>
      </div>
      <p className="px-4 pt-4 text-small"><Link to={`/agents/${agent.handle}`} className={`rounded text-link hover:underline ${FOCUS_RING}`}>Its own page under Agents ›</Link></p>
    </div>
  )
}

/**
 * The Agents tool of a personal place (Your space or a personal project; every screen reviewed spec §3, §7): its
 * roster, with Add and Remove for its owner; one agent shows your permissions in Chat. Addressed as
 * `?tool=agents&agent=<id>&focus=permissions`, `&aview=assign` to add and `&agent=<id>&aview=remove` to remove.
 */
export function ChatAgentsTool({ projectId }: { projectId: string | undefined }) {
  const url = useAgentsToolUrl()
  const { screen } = url
  if (!projectId) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (screen.kind === 'assign') return <AssignScreen projectId={projectId} onBack={url.toList} />
  if (screen.kind === 'remove') {
    return <RemoveScreen projectId={projectId} agentId={screen.agentId} onCancel={url.toList} onRemoved={url.toList} />
  }
  if (screen.kind === 'agent') return <ChatAgent key={screen.agentId} agentId={screen.agentId} focus={url.focus} onBack={url.toList} />
  return <AgentsList projectId={projectId} onOpen={url.toAgent} onAdd={url.toAssign} onRemove={url.toRemove} />
}
