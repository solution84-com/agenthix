/** Where a place's conversations live in the address bar: a list at `basePath`, one conversation under `t`. */
export function threadPath(basePath: string, conversationId: string): string {
  return `${basePath}/t/${conversationId}`
}

/** The list, with a new conversation's agent preselected in the message box. */
export function newConversationPath(basePath: string, agentId: string | null): string {
  return agentId ? `${basePath}?agent=${encodeURIComponent(agentId)}` : basePath
}
