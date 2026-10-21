import { useAuth } from 'wasp/client/auth'
import { PlaceScreen } from '../../places/components/PlaceScreen'
import { PlaceMobileHeader } from '../../places/components/PlaceMobileHeader'
import { ChatLoading } from '../components/ChatLoading'
import { useChatPlace } from '../useChatPlace'
import { SpaceConversations } from './ChatPage'

const CRUMBS = [{ label: 'Your space' }]

/**
 * Your space (spec §7, §8): the person's default personal project as a place, its sections, opening on
 * Overview. It is top level, so a small screen's header opens the navigation (☰).
 */
export function SpacePage() {
  const place = useChatPlace()
  const { data: user } = useAuth()
  if (!place || !user) return <ChatLoading breadcrumbs={CRUMBS} />

  return (
    <PlaceScreen
      place={place}
      breadcrumbs={CRUMBS}
      mobileHeader={<PlaceMobileHeader backHref={null} title="Your space" />}
      conversations={<SpaceConversations place={place} />}
    />
  )
}
