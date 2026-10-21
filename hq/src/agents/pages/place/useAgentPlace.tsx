import { useMemo } from 'react'
import { useAuth } from 'wasp/client/auth'
import {
  useQuery, getAgentByHandle, getAgentPlace, getAgentUsage,
} from 'wasp/client/operations'
import { Link } from 'react-router'
import type { Place, PlaceToolGroup } from '../../../places/placeTypes'
import { modelsForRuntime } from '../../models'
import type { AgentPlaceView } from '../../agentPlaceQueries'
import { AgentNowTool } from './AgentNowTool'
import { AgentProjectsTool } from './AgentProjectsTool'
import { AgentRunsTool } from './AgentRunsTool'
import { AgentUsageTool } from './AgentUsageTool'
import { AgentInstructionsTool } from './AgentInstructionsTool'
import { AgentMemoryTool } from '../../../memory/screen/pages/AgentMemoryTool'
import { AgentSettingsTool } from './AgentSettingsTool'
import { nowCount, usageCount } from './agentPlaceCounts'
import { monthStart } from './usageView'

export function modelLabelOf(runtime: string, model: string): string {
  return modelsForRuntime(runtime).find(m => m.value === model)?.label ?? model
}

/** An agent's sections after Overview and Conversations (spec §7). */
const AGENT_SECTION_ORDER = ['now', 'projects', 'runs', 'usage', 'instructions', 'memory', 'settings']

function toolGroups(view: AgentPlaceView, userId: string, extra: { usage: string | undefined; since: string }): PlaceToolGroup[] {
  const { agent } = view
  const label = (model: string) => modelLabelOf(agent.runtime, model)
  const now = nowCount(view.now)
  const yourModel = view.yourNarrowing?.model
  return [
    {
      label: 'At work',
      tools: [
        { id: 'now', label: 'Now', ...now, render: () => <AgentNowTool view={view} /> },
        { id: 'projects', label: 'Projects', count: String(view.projects.length), render: () => <AgentProjectsTool agentId={agent.id} projects={view.projects} modelLabel={label} /> },
        { id: 'runs', label: 'Runs', count: view.recentRuns.runs.length ? `${view.recentRuns.runs.length} recent` : undefined, render: () => <AgentRunsTool recentRuns={view.recentRuns} /> },
        { id: 'usage', label: 'Usage', count: extra.usage, render: () => <AgentUsageTool agentId={agent.id} since={extra.since} /> },
      ],
    },
    {
      label: 'About it',
      tools: [
        { id: 'instructions', label: 'Your instructions', render: () => <AgentInstructionsTool agentId={agent.id} /> },
        { id: 'memory', label: 'Memory', render: () => <AgentMemoryTool agentId={agent.id} agentName={agent.name} /> },
        { id: 'settings', label: 'Your settings', count: yourModel ? `${label(yourModel)} for you` : undefined, render: () => <AgentSettingsTool agentId={agent.id} userId={userId} /> },
      ],
      footer: view.canManage ? (
        <p className="mt-4 text-small">
          <Link to={`/org/agents/${agent.handle}`} className="font-medium text-accent hover:text-accent-hover">Manage ›</Link>
        </p>
      ) : undefined,
    },
  ]
}

/**
 * An agent as a place (spec §7): its tools as you see them, as sections, and a Conversations section with its message box.
 * A conversation started here lives in your Chat, so the message box works from `/chat`.
 */
export function useAgentPlace(handle: string | undefined) {
  const { data: user } = useAuth()
  const stub = useQuery(getAgentByHandle, { handle: handle! }, { enabled: !!handle })
  const agentId = (stub.data as { id?: string } | undefined)?.id
  const place = useQuery(getAgentPlace, { agentId: agentId! }, { enabled: !!agentId })
  const since = useMemo(() => monthStart(new Date()), [])
  const usage = useQuery(getAgentUsage, { agentId: agentId!, since }, { enabled: !!agentId })
  const view = place.data
  const usageLine = usageCount(usage.data)

  const asPlace: Place | undefined = useMemo(() => {
    if (!view || !user) return undefined
    const { agent } = view
    return {
      basePath: `/agents/${agent.handle}`,
      homePath: `/agents/${agent.handle}`,
      breadcrumbs: [{ label: 'Agents', href: '/agents' }, { label: agent.name, href: `/agents/${agent.handle}` }],
      name: agent.name,
      talkLabel: `Talk to ${agent.name}`,
      factsHeading: 'About this agent',
      backHref: '/agents',
      projectId: null,
      sessionLocation: null,
      agents: [{ id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl }],
      defaultAgentId: agent.id,
      composerPlaceholder: `Talk to ${agent.name}… (in your Chat)`,
      noAgentsNotice: 'This agent cannot be talked to',
      facts: [
        { label: 'Role', value: agent.role ?? 'None' },
        { label: 'Handle', value: `@${agent.handle}` },
        { label: 'Model', value: modelLabelOf(agent.runtime, agent.defaultModel) },
      ],
      toolGroups: toolGroups(view, user.id, { usage: usageLine, since }),
      sectionOrder: AGENT_SECTION_ORDER,
    }
  }, [view, user, usageLine, since])

  return { view, place: asPlace, isLoading: stub.isLoading || place.isLoading, error: stub.error ?? place.error }
}
