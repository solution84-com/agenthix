import { CHAT_PATH } from '../chat/chatComposer'
import { CONVERSATIONS_SECTION } from '../places/placeSections'

/** The open conversation, on whatever page the canvas shows: `/projects/AGX/tasks?c=<id>` (spec §3). */
export const CONVERSATION_PARAM = 'c'

export interface AddressParts {
  pathname: string
  search: string
  hash?: string
}

export interface ThreadAddress {
  conversationId: string
  /** The place's list the address names: `/chat` or `/projects/KEY`. */
  basePath: string
}

const THREAD_ADDRESS = /^(\/chat|\/projects\/[^/]+)\/t\/([^/]+)\/?$/

/** A conversation's own address, `/chat/t/<id>` or `/projects/<key>/t/<id>`, or null for any other. */
export function threadAddressOf(pathname: string): ThreadAddress | null {
  const m = THREAD_ADDRESS.exec(pathname)
  if (!m) return null
  return { basePath: m[1], conversationId: decodeURIComponent(m[2]) }
}

export function conversationParamOf(search: string): string | null {
  return new URLSearchParams(search).get(CONVERSATION_PARAM) || null
}

/** The address with the open conversation set, or taken off when `conversationId` is null; the rest kept as it is. */
export function withConversation(at: AddressParts, conversationId: string | null): string {
  const params = new URLSearchParams(at.search)
  if (conversationId) params.set(CONVERSATION_PARAM, conversationId)
  else params.delete(CONVERSATION_PARAM)
  const query = params.toString()
  return `${at.pathname}${query ? `?${query}` : ''}${at.hash ?? ''}`
}

/** A place's Conversations section, where a conversation's address shows its place when opened from outside hq. */
export function conversationsSectionOf(basePath: string): AddressParts {
  if (basePath === CHAT_PATH) return { pathname: CHAT_PATH, search: '' }
  return { pathname: basePath, search: `?tool=${CONVERSATIONS_SECTION}` }
}
