import { PlaceAvatar } from '@agenthix/ui/primitives'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import type { PinnedItem } from '../pinTypes'

/** An agent's own avatar; a project's or a board's default one (spec §1). */
export function PinAvatar({ item }: { item: Pick<PinnedItem, 'kind' | 'itemId' | 'name' | 'avatarUrl'> }) {
  if (item.kind === 'AGENT') return <AuthedAgentAvatar name={item.name} avatarUrl={item.avatarUrl} size="sm" />
  return <PlaceAvatar kind={item.kind === 'BOARD' ? 'board' : 'project'} id={item.itemId} name={item.name} size="sm" />
}
