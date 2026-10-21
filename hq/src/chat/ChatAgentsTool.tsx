import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getOrgAgents } from 'wasp/client/operations'
import { PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import { nowLine } from '@agenthix/ui/agents'
import { AuthedAgentAvatar } from '../shared/components/AuthedAgentAvatar'
import { AgentPermissionsHere } from '../agents/pages/AgentPermissionsHere'
import type { OrgAgentsView } from '../agents/agentPlaceQueries'
import { useAgentsToolUrl } from '../projects/agents/useAgentsToolUrl'

const TONE = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' } as const

function AgentsList({ onOpen }: { onOpen: (agentId: string) => void }) {
  const { data, isLoading, error } = useQuery(getOrgAgents, { filter: 'all' })
  const view = data as OrgAgentsView | undefined
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !view) return <p role="alert" className="px-4 py-6 text-small text-danger">{error?.message ?? 'Could not read the agents'}</p>
  const now = new Date()
  return (
    <div className="pb-6">
      <p className="px-4 pt-4 text-small text-text-muted">Any agent in the organisation can be talked to here. Open one to see your permissions for it in Chat.</p>
      <ul className="space-y-2 px-4 pt-4">
        {view.agents.map(({ agent, now: state }) => {
          const line = nowLine(state, now)
          return (
            <li
              key={agent.id} onClick={() => onOpen(agent.id)}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 hover:border-accent"
            >
              <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <button type="button" aria-label={`Open ${agent.name}`} className="block max-w-full truncate rounded text-left text-body font-semibold text-text-primary">
                  {agent.name}{agent.role && <span className="ml-2 text-small font-normal text-text-muted">{agent.role}</span>}
                </button>
                <p className="truncate text-small text-text-secondary">
                  <span className={`font-medium ${TONE[line.tone]}`}>{line.label}</span>{line.detail && <> · {line.detail}</>}
                </p>
              </div>
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
          <p className="truncate text-body font-semibold text-text-primary">{agent.name}</p>
          <p className="truncate text-small text-text-muted">{agent.role ? `${agent.role} · ` : ''}in your Chat</p>
        </div>
      </div>
      <div ref={permissionsRef} className="scroll-mt-12 px-4 pt-6">
        <AgentPermissionsHere
          agentId={agent.id} agentName={agent.name} boundaryType="user" boundaryId={user.id} title="Your permissions in Chat"
        />
        <p className="pt-3 text-micro text-text-muted">Only you see and change these, and they apply to runs in your Chat.</p>
      </div>
      <p className="px-4 pt-4 text-small"><Link to={`/agents/${agent.handle}`} className="text-accent hover:underline">Its own page under Agents ›</Link></p>
    </div>
  )
}

/**
 * Chat's Agents tool (every screen reviewed spec §3, §7): the organisation's agents, opened from Chat's Agents fact;
 * one agent shows your permissions in Chat. Addressed as `?tool=agents&agent=<id>&focus=permissions`.
 */
export function ChatAgentsTool() {
  const url = useAgentsToolUrl()
  const { screen } = url
  if (screen.kind === 'agent') return <ChatAgent key={screen.agentId} agentId={screen.agentId} focus={url.focus} onBack={url.toList} />
  return <AgentsList onOpen={url.toAgent} />
}
