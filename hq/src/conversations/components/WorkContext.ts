import type { ConversationAgentView, ConversationPersonView } from '../../shared/conversations/protocol'

/** What the thread's cards need from the conversation: who reads it, the work it knows, where things open. */
export type WorkContext = {
  conversationId: string
  myId: string | null
  /** Where a new conversation with this agent starts, for the lead's offer of one. */
  newConversationHref?: string
  /** The place's address, where an action line's *Show in …* opens a tool. */
  placePath?: string
  /** Whether the viewer is the conversation's person, who alone adds a place (the suggest-a-place card's buttons). */
  canChangePlaces?: boolean
  /** Everyone who has spoken here; their names are shown once more than one has. */
  people?: ConversationPersonView[]
  /** In a task's thread, every agent that may have answered in it, so a reply keeps the name of the agent that wrote it after the task changed hands. */
  agentsById?: Record<string, ConversationAgentView>
}
