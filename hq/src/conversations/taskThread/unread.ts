/**
 * What counts as unread on a task's card (on-screen spec, A task's thread): what someone else said or what came
 * back — a message, a completion, a request for approval, a failure — not the quiet lines around them.
 */
import type { ConversationMessageKindValue } from '../../shared/conversations/protocol'

export const UNREAD_KINDS: readonly ConversationMessageKindValue[] = ['TEXT', 'RESULT', 'APPROVAL_REQUEST', 'FAILED']
