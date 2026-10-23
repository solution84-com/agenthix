import { CLAUDE_SDK_RUNTIME } from '@agenthix/core'

/** The runtime whose models a conversation is offered: the one it started on
 *  (adr-0078), else Claude's for a session with none recorded. */
export function conversationRuntime(session: { runtime?: string | null } | null | undefined): string {
  return session?.runtime ?? CLAUDE_SDK_RUNTIME
}
