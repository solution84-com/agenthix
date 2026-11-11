import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, getOrgAgents } from 'wasp/client/operations'
import { Bot } from 'lucide-react'
import { PlaceCard } from '@agenthix/ui/projects'
import { SearchField, UnansweredSitesNotice, SegmentedControl, FOCUS_RING } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { EmptyState } from '../../shared/components/ui/EmptyState'
import { unansweredSitesCopy } from '../../shared/siteSilence'
import { CHAT_PATH } from '../../chat/chatComposer'
import { newConversationPath } from '../../conversations/threadPaths'
import { useAgentModelLine } from '../useAgentModelLine'
import { agentCardNow, agentCardFacts } from './agentCardView'
import { AgentCover } from './AgentCover'
import { ReadFailure } from '@agenthix/ui/attention'

type Filter = 'all' | 'mine'


/**
 * Agents (every screen reviewed spec §3): the organisation's agents as the cards the Projects screen uses.
 * Using an agent starts here; managing one is under Organisation, for admins.
 */
export function AgentListPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const { data, isLoading, error, refetch } = useQuery(getOrgAgents, { filter })
  const at = new Date()
  const modelLine = useAgentModelLine()
  const navigate = useNavigate()
  // The Agents screen is no place, so a new conversation starts in the person's Chat.
  const newConversation = (agentId: string) => navigate(newConversationPath(CHAT_PATH, agentId))

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.agents ?? []).filter(({ agent }) => !q || `${agent.name} ${agent.handle} ${agent.role ?? ''}`.toLowerCase().includes(q))
  }, [data, search])

  const count = data?.agents.length
  return (
    <AppLayout
      breadcrumbs={[{ label: 'Agents' }]}
      title="Agents"
      subtitle={count === undefined ? undefined : `${count} in the organisation`}
      action={data?.canManage ? (
        <Link to="/admin/agents" className={`rounded text-body font-medium text-link hover:underline ${FOCUS_RING}`}>Manage agents ›</Link>
      ) : undefined}
    >
      <div className="space-y-4 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Which agents" value={filter} onChange={setFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'In my projects' }] as const}
          />
          <SearchField label="Search agents" value={search} onChange={setSearch} className="min-w-[140px] flex-1 lg:max-w-[240px] lg:flex-none" />
        </div>

        <UnansweredSitesNotice copy={unansweredSitesCopy(data?.unanswered ?? [], 'when each agent last worked')} />

        {isLoading && <p className="text-body text-text-muted">Loading…</p>}
        {error && <ReadFailure what="The agents" retry={() => void refetch()} />}
        {data && data.agents.length === 0 && (
          <EmptyState icon={Bot} title={filter === 'mine' ? 'No agent is in your projects' : 'No agents yet'} hint={data.canManage ? 'Create one under Manage organisation › Agents' : 'An organisation admin creates agents'} />
        )}
        {data && data.agents.length > 0 && shown.length === 0 && <p className="text-body text-text-muted">No agent matches.</p>}

        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {shown.map((card) => {
            const now = agentCardNow(card.now, card.projectCount, at)
            const model = modelLine(card.agent.id)
            return (
              <PlaceCard
                key={card.agent.id}
                as={Link}
                to={`/agents/${card.agent.handle}`}
                cover={<AgentCover coverUrl={card.agent.coverUrl} />}
                avatar={<AuthedAgentAvatar name={card.agent.name} avatarUrl={card.agent.avatarUrl} size="lg" />}
                name={card.agent.name}
                line={[card.agent.role, `@${card.agent.handle}`].filter(Boolean).join(' · ')}
                now={now}
                facts={agentCardFacts({ projectCount: card.projectCount, lastWorkedAt: card.lastWorkedAt, isKernel: card.agent.isKernel, state: now.state }, model, at)}
                action="New conversation →"
                onAction={() => newConversation(card.agent.id)}
              />
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
