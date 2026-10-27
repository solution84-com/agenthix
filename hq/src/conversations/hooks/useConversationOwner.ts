import { useMemo } from 'react'
import type { StorageOwnerRef } from '@agenthix/core'
import { useQuery, getConversationPlaces } from 'wasp/client/operations'

/** The storage of the conversation's own place: its project's, or its person's own. Null until it is known. */
export function useConversationOwner(conversationId: string, openedById: string | undefined): StorageOwnerRef | null {
  const { data } = useQuery(getConversationPlaces, { conversationId })
  const own = data?.own
  return useMemo(() => {
    if (!own) return null
    if (own.kind === 'project') return { ownerType: 'project', ownerId: own.projectId }
    return openedById ? { ownerType: 'user', ownerId: openedById } : null
  }, [own?.kind, own?.kind === 'project' ? own.projectId : null, openedById])
}
