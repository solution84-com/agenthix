import { PersonAvatar } from '@agenthix/ui/people'
import type { RenderPersonAvatar } from '@agenthix/ui/people'
import { useAgentImageUrl } from '../shared/hooks/useAgentImageUrl'

/** A person's picture through the signed-in image cache the agents' pictures use, else their initial. */
export function AuthedPersonAvatar({ person, size }: { person: { userId: string; name: string; avatarUrl: string | null }; size?: 'sm' | 'md' | 'lg' }) {
  const src = useAgentImageUrl(person.avatarUrl)
  return <PersonAvatar person={person} src={src} size={size} />
}

export const personAvatarOf: RenderPersonAvatar = (person, size) => <AuthedPersonAvatar person={person} size={size} />
