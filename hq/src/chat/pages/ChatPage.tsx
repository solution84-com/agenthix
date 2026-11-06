import { Navigate, useLocation } from 'react-router'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { CONVERSATIONS_SECTION, conversationsPageRedirect } from '../../places/placeSections'
import type { Place } from '../../places/placeTypes'
import { ChatLoading } from '../components/ChatLoading'
import { useChatPlace } from '../useChatPlace'
import { SPACE_PATH } from '../chatPlacePaths'
import { NewConversationsList } from '../../conversations/components/NewConversationsList'
import { ChatList } from '../components/ChatList'

/** Your space's conversations, a list of them; your space has its header above its sections. */
export function SpaceConversations({ place }: { place: Place }) {
  return <NewConversationsList place={place} header={null} home="PERSON" />
}

/**
 * Chat (the board's f5): the list for working through every conversation the person can open — the person's own space and
 * their projects — with no row of sections (the sections are at Your space). Chat is top level, so a small screen's
 * header opens the navigation (☰). A tool's address here opens that section of your space.
 */
export function ChatPage() {
  const place = useChatPlace()
  const { search } = useLocation()
  const redirect = conversationsPageRedirect(search, SPACE_PATH)
  if (redirect) return <Navigate to={redirect} replace />
  if (!place) return <ChatLoading breadcrumbs={[{ label: 'Chat' }]} />

  return (
    <PlaceScreen
      // The list's own New conversation starts one in your space; a second button in the screen bar would do the same.
      place={{ ...place, talkLabel: '' }}
      breadcrumbs={[{ label: 'Chat' }]}
      mobileHeader={<PlaceMobileHeader backHref={null} title="Chat" />}
      conversations={<ChatList />}
      section={CONVERSATIONS_SECTION}
      isPlace={false}
    />
  )
}
