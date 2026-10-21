/**
 * The people of a conversation (the overview's rules for several people, 7): everyone who has spoken in it, first
 * spoken first, so the screen can name each message's author once more than one has.
 */
import { peopleByIds } from '../server/identity/people'
import type { ConversationPersonView } from '../shared/conversations/protocol'
import { speakersOf } from './taskThread/recipients'

export async function peopleOf(conversationId: string): Promise<ConversationPersonView[]> {
  const ids = await speakersOf(conversationId)
  const people = await peopleByIds(ids)
  return ids.map(id => {
    const person = people.get(id)!
    return { id, name: person.name, avatarUrl: person.avatarUrl }
  })
}
