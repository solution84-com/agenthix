import type { ConversationHomeRef } from '../conversations/contract'
import { placeOfConversation } from '../routing/place'
import type { SpeechScope } from './speechAccess'

/** A conversation's speech is costed to its place: a project's conversation to its project's billing profile. */
export async function scopeOfConversation(ref: Pick<ConversationHomeRef, 'id' | 'home' | 'projectId' | 'taskId' | 'openedById'>, userId: string): Promise<SpeechScope> {
  return { place: await placeOfConversation(ref), userId, conversationId: ref.id }
}
