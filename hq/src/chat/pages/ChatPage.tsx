import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { CONVERSATIONS_SECTION, conversationsPageRedirect } from '../../places/placeSections'
import type { Place } from '../../places/placeTypes'
import { ChatLoading } from '../components/ChatLoading'
import { useUsername } from '../../shared/useUsername'
import { useChatPlace } from '../useChatPlace'
import { SPACE_PATH } from '../chatPlacePaths'
import { NewConversationsList } from '../../conversations/components/NewConversationsList'
import { ChatPlaceHeader } from '../components/ChatPlaceHeader'

/** Your space's conversations, and the message box to any agent. Chat adds its own header; your space has it above its sections. */
export function SpaceConversations({ place, header }: { place: Place; header?: ReactNode }) {
  return (
    <NewConversationsList
      place={place}
      header={header}
      home="PERSON"
      boxPlaceholder="Ask your agent…"
      noAgentsNotice="Add an agent to the organisation to talk to it"
    />
  )
}

/**
 * Chat: only the conversations of the person's own space, headed "Chat", with no row of sections (the sections are at Your
 * space). Chat is top level, so a small screen's header opens the navigation (☰). A tool's address here opens that
 * section of your space.
 */
export function ChatPage() {
  const place = useChatPlace()
  const { data: user } = useAuth()
  const { search } = useLocation()
  const username = useUsername() ?? ''
  const redirect = conversationsPageRedirect(search, SPACE_PATH)
  if (redirect) return <Navigate to={redirect} replace />
  if (!place || !user) return <ChatLoading breadcrumbs={[{ label: 'Chat' }]} />

  return (
    <PlaceScreen
      place={place}
      breadcrumbs={[{ label: 'Chat' }]}
      mobileHeader={<PlaceMobileHeader backHref={null} title="Chat" />}
      conversations={<SpaceConversations place={place} header={<ChatPlaceHeader userId={user.id} username={username} />} />}
      section={CONVERSATIONS_SECTION}
      isPlace={false}
    />
  )
}
