import { PersonAvatar } from '@agenthix/ui/people'
import { useAgentImageUrl } from '../../../shared/hooks/useAgentImageUrl'

type Face = { userId: string; name: string; avatarUrl: string | null }

/** A person's picture, fetched signed in, else their initial on a colour (`PersonAvatar`). */
export function PersonFace({ person, size = 'md' }: { person: Face; size?: 'sm' | 'md' | 'lg' }) {
  const src = useAgentImageUrl(person.avatarUrl)
  return <PersonAvatar person={person} src={src ?? null} size={size} />
}
