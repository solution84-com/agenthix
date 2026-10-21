import { Navigate, useLocation, useParams } from 'react-router'
import { useQuery, getConversation } from 'wasp/client/operations'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { CONVERSATIONS_SECTION, conversationsPageRedirect } from '../../places/placeSections'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { ChatLoading } from '../../chat/components/ChatLoading'
import { useChatPlace } from '../../chat/useChatPlace'
import { CHAT_PATH } from '../../chat/chatComposer'
import { SPACE_PATH } from '../../chat/chatPlacePaths'
import { ConversationThread } from '../components/ConversationThread'
import { useDocked } from '../../dock/DockContext'

/**
 * A conversation in your space. Under the root shell, at every width, this address only opens it in the dock: the
 * shell replaces it at once, and until then the page waits. Drawn alone, with no shell, it shows the conversation on
 * its Conversations section, in place of the list. A tool's address here opens that section of your space.
 */
export function ChatThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { search } = useLocation()
  const place = useChatPlace()
  const docked = useDocked()
  const { data: view } = useQuery(getConversation, { conversationId: conversationId! }, { enabled: !!conversationId && !docked })
  if (docked) return <ChatLoading breadcrumbs={[{ label: 'Chat', href: CHAT_PATH }, { label: '…' }]} />
  const redirect = conversationsPageRedirect(search, SPACE_PATH)
  if (redirect) return <Navigate to={redirect} replace />
  if (!place || !conversationId) return <ChatLoading breadcrumbs={[{ label: 'Chat', href: CHAT_PATH }, { label: '…' }]} />

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
