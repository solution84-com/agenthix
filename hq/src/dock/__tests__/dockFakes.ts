/**
 * Stand-ins for the dock's reads of the person's conversations, for the dock's tests. Wire them in a test file with
 *   vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
 *   vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
 *   vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
 * and set `fake` in `beforeEach` (`resetFake()`).
 */
import type { ConversationInbox, InboxConversation } from '../../shared/conversations/inbox'
import { inboxTotals } from '../../shared/conversations/inbox'
import type { PinnedPlace } from '../pinnedPlaces'

export const fake = {
  inbox: { conversations: [], waiting: 0, needsYou: 0, unread: 0 } as ConversationInbox,
  /** Pinned projects, after the person's own space. */
  pinned: [] as PinnedPlace[],
  /** Each conversation the panel had in sight, as it reported it. */
  inSight: [] as string[],
}

export function resetFake() {
  setInbox([])
  fake.pinned = []
  fake.inSight = []
}

export function setInbox(conversations: InboxConversation[]) {
  fake.inbox = { conversations, ...inboxTotals(conversations) }
}

export function row(id: string, more: Partial<InboxConversation> = {}): InboxConversation {
  return {
    id, title: `Talk ${id}`, place: { kind: 'space' }, agent: null, lastMessageAt: '2026-11-05T08:00:00Z', lastSeq: 1,
    lastLine: null, needsYou: 0, unread: 0, working: false, ...more,
  }
}

export const inboxModule = { useConversationInbox: () => ({ inbox: fake.inbox, loaded: true }) }

export const markModule = {
  useMarkShownRead: (id: string | null) => { if (id && fake.inSight.at(-1) !== id) fake.inSight.push(id) },
  useMarkSeen: () => () => undefined,
}

export function pinnedModule(real: typeof import('../pinnedPlaces')) {
  return { ...real, usePinnedPlaces: () => [real.SPACE_PLACE, ...fake.pinned] }
}
