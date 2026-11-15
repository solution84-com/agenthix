import { HttpError } from 'wasp/server'
import type { ForgetMemoryItem, SetMemoryScope } from 'wasp/server/operations'
import type { MemoryItemIdArgs, MemoryScopeChoice } from '../../shared/memory/protocol'
import { memoryService } from '../memoryService'
import { memoryIdOf, signedIn } from './access'

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
