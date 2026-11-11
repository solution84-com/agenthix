import { Link, useParams } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { ReadFailure } from '@agenthix/ui/attention'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AgentConversations } from './place/AgentConversations'
import { useAgentPlace } from './place/useAgentPlace'

function Missing({ loading, notFound, retry }: { loading: boolean; notFound: boolean; retry: () => void }) {
  return (
    <AppLayout breadcrumbs={[{ label: 'Agents', href: '/agents' }, { label: loading ? '…' : 'Not found' }]}>
      <div className="px-6 py-16 text-center">
        {loading ? <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-text-secondary" /> : (
          <>
            {notFound ? <ReadFailure what="The agent" final="Agent not found. It does not exist or has been deleted." /> : <ReadFailure what="The agent" retry={retry} />}
            <Link to="/agents" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Back to Agents</Link>
          </>
        )}
      </div>
    </AppLayout>
  )
}

/** An agent's place (spec §7): using an agent, its sections. Managing it is Organisation › Agents. */
export function AgentPlacePage() {
  const { handle } = useParams<{ handle: string }>()
  const { view, place, isLoading, error, retry } = useAgentPlace(handle)
  if (!view || !place) {
    const notFound = !!error && (error as { statusCode?: number }).statusCode === 404
    return <Missing loading={isLoading && !error} notFound={notFound} retry={retry} />
  }

  return (
    <PlaceScreen
      place={place}
      breadcrumbs={[place.breadcrumbs[0], { label: view.agent.name }]}
      mobileHeader={<PlaceMobileHeader backHref={place.backHref} title={view.agent.name} />}
      conversations={<AgentConversations composerPlace={{ ...place, basePath: '/chat' }} />}
    />
  )
}
