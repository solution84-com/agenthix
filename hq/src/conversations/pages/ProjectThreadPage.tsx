import { Navigate, useLocation, useParams } from 'react-router'
import { useQuery, getConversation } from 'wasp/client/operations'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { CONVERSATIONS_SECTION, conversationsPageRedirect } from '../../places/placeSections'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { useProjectPlace } from '../../projects/place/useProjectPlace'
import { ProjectPlaceMissing } from '../../projects/place/ProjectPlaceMissing'
import { ConversationThread } from '../components/ConversationThread'
import { threadPath } from '../threadPaths'
import { useDocked } from '../../dock/DockContext'

/**
 * A conversation in a project. Under the root shell, at every width, this address only opens it in the dock: the
 * shell replaces it at once, and until then the page waits. Drawn alone, with no shell, it shows the conversation
 * on its Conversations section, in place of the list. A tool's address here opens that section of the project.
 */
export function ProjectThreadPage() {
  const { key, conversationId } = useParams<{ key: string; conversationId: string }>()
  const { search } = useLocation()
  const docked = useDocked()
  const { project, place, isLoading } = useProjectPlace(key)
  const { data: view } = useQuery(getConversation, { conversationId: conversationId! }, { enabled: !!conversationId && !docked })
  if (docked) return <ProjectPlaceMissing loading />
  if (!project || !place || !conversationId) return <ProjectPlaceMissing loading={isLoading} />
  // Your space is shown as Chat.
  if (project.personalSpace) return <Navigate to={threadPath('/chat', conversationId) + search} replace />
  const redirect = conversationsPageRedirect(search, place.homePath)
  if (redirect) return <Navigate to={redirect} replace />

  const title = view?.title || (view ? 'New conversation' : '…')
  const agent = view?.agent
  return (
    <PlaceScreen
      place={place}
      breadcrumbs={[...place.breadcrumbs, { label: title }]}
      mobileHeader={
        <PlaceMobileHeader
          backHref={place.basePath}
          leading={agent ? <AgentProfileTrigger agentId={agent.id}><AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="sm" /></AgentProfileTrigger> : undefined}
          title={title}
        />
      }
      conversations={<ConversationThread key={conversationId} conversationId={conversationId} listPath={place.basePath} />}
      section={CONVERSATIONS_SECTION}
    />
  )
}
