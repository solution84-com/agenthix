import { HttpError } from 'wasp/server'
import type { ForgetMemoryItem, SaveMemoryItem, SetMemoryPinned, SetMemoryScope } from 'wasp/server/operations'
import type {
  MemoryItemIdArgs, MemoryItemView, MemoryScopeChoice, SaveMemoryItemArgs, SetMemoryPinnedArgs,
} from '../../shared/memory/protocol'
import { memoryService } from '../memoryService'
import { memoryIdOf, signedIn } from './access'

/** @deprecated A person no longer adds or edits a memory (ADR-0188): an agent saves it, and the person tells it to change. */
export const saveMemoryItem: SaveMemoryItem<SaveMemoryItemArgs, MemoryItemView> = async (_args, context) => {
  signedIn(context)
  throw new HttpError(410, 'A memory is no longer added or changed here. Tell the agent in a conversation, or forget the memory.')
}

/** @deprecated Nothing is pinned any more (ADR-0188): a Rule is weighted up in recall instead. */
export const setMemoryPinned: SetMemoryPinned<SetMemoryPinnedArgs, { ok: true }> = async (_args, context) => {
  signedIn(context)
  throw new HttpError(410, 'Memories are no longer pinned.')
}

/** The two switches: which agents remember it, and where. Each press takes effect at once. */
export const setMemoryScope: SetMemoryScope<MemoryItemIdArgs & MemoryScopeChoice, { itemId: string }> = async (args, context) => {
  const userId = signedIn(context)
  memoryIdOf(args)
  if ((args.agent !== 'every' && args.agent !== 'saved') || (args.place !== 'everywhere' && args.place !== 'saved')) {
    throw new HttpError(400, 'Choose which agents remember it, and where')
  }
  const outcome = await memoryService.setScope(userId, args.id, { agent: args.agent, place: args.place })
  if (outcome.status === 'refused') throw new HttpError(409, outcome.reason)
  return { itemId: outcome.itemId }
}

/** Forgetting is deleting: the memory is gone, not archived. A person forgets only their own. */
export const forgetMemoryItem: ForgetMemoryItem<MemoryItemIdArgs, { ok: boolean }> = async (args, context) => {
  const userId = signedIn(context)
  return { ok: await memoryService.forgetOwn(userId, memoryIdOf(args)) }
}
