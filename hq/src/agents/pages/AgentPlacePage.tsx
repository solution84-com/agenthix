import { Link, useParams } from 'react-router'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AgentConversations } from './place/AgentConversations'
import { useAgentPlace } from './place/useAgentPlace'

function Missing({ loading, notFound }: { loading: boolean; notFound: boolean }) {
  return (
    <AppLayout breadcrumbs={[{ label: 'Agents', href: '/agents' }, { label: loading ? '…' : 'Not found' }]}>
      <div className="px-6 py-16 text-center">
        {loading ? <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-accent" /> : (
          <>
            <h2 className="mb-2 text-h2 font-semibold text-text-primary">{notFound ? 'Agent not found' : 'Error loading agent'}</h2>
            <p className="mb-6 text-text-muted">{notFound ? 'It does not exist or has been deleted.' : 'Something went wrong while loading the agent.'}</p>
            <Link to="/agents" className="font-medium text-accent hover:text-accent-hover">Back to Agents</Link>
          </>
        )}
      </div>
    </AppLayout>
  )
}

/** An agent's place (spec §7): using an agent, its sections. Managing it is Organisation › Agents. */
export function AgentPlacePage() {
  const { handle } = useParams<{ handle: string }>()
  const { view, place, isLoading, error } = useAgentPlace(handle)
  if (!view || !place) {
    const notFound = !!error && (error as { statusCode?: number }).statusCode === 404
    return <Missing loading={isLoading && !error} notFound={notFound} />
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
