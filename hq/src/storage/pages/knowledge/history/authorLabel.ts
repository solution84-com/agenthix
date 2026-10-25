import type { ChangeAuthorView } from './types'

/** "Mia", or "Kernel, asked by Sam" for an agent; the person it answered is named when known. */
export function authorLabel(by: ChangeAuthorView | undefined): string {
  if (!by) return 'Someone'
  if (by.kind === 'person') return by.name
  return by.forName ? `${by.agentName}, asked by ${by.forName}` : by.agentName
}

/** Where an agent's change happened, as a path inside hq; null for a person, or when it did not say. */
export function authorHref(by: ChangeAuthorView | undefined): string | null {
  if (!by || by.kind !== 'agent') return null
  if (by.conversationId) return `/chat/t/${encodeURIComponent(by.conversationId)}`
  if (by.runId) return `/runs/${encodeURIComponent(by.runId)}`
  return null
}
