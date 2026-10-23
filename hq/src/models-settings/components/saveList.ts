import { useAction, setModelList } from 'wasp/client/operations'
import type { ModelListOwner } from '@agenthix/core'
import type { ListDraft } from './ListEditor'

/** Saves a whole list for its owner; the server decides who may. */
export function useModelListSaver(owner: ModelListOwner) {
  const act = useAction(setModelList)
  return (ownerId: string, draft: ListDraft) => act({ owner, ownerId, mode: draft.mode, entries: draft.entries })
}
