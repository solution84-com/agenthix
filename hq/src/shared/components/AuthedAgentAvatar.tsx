import { AgentAvatar } from './SessionComponents'
import { useAgentImageUrl } from '../hooks/useAgentImageUrl'

/**
 * AgentAvatar wired to the authenticated image cache. The image route now
 * requires a session, so every place that renders an agent's avatar from its
 * raw stored path (rather than one already resolved upstream) uses this in
 * place of AgentAvatar directly — including inside a `.map()`, since each
 * JSX use of this component is its own instance and may call the hook.
 */
export function AuthedAgentAvatar({
  name,
  avatarUrl,
  size,
}: {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const resolvedUrl = useAgentImageUrl(avatarUrl)
  return <AgentAvatar name={name} avatarUrl={resolvedUrl} size={size} />
}
