import { describe, expect, it } from 'vitest'
import type { ConversationSummaryView } from '../../shared/conversations/protocol'
import { threadRows } from '../threadRows'

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
function conversation(id: string, lastMessageAt: string, over: Partial<ConversationSummaryView> = {}): ConversationSummaryView {
  return { id, home: 'PERSON', projectId: null, taskId: null, title: id, status: 'ACTIVE', closedReason: null, agent, lastMessageAt, ...over }
}

describe('threadRows @SC-1012', () => {
  const rows = threadRows(
    [
      conversation('c2', '2026-10-14T09:00:00Z', { status: 'CLOSED', closedReason: 'PROJECT_DELETED' }),
      conversation('c1', '2026-10-16T09:00:00Z'),
    ],
    '/chat',
  )

  it('lists the most recently active first', () => {
    expect(rows.map((r) => r.id)).toEqual(['c1', 'c2'])
  })

  it('opens each in the thread', () => {
    expect(rows.map((r) => r.href)).toEqual(['/chat/t/c1', '/chat/t/c2'])
  })

  it('marks what is closed, and nothing else', () => {
    expect(rows.map((r) => r.mark)).toEqual([null, 'Closed · its project was deleted'])
  })
})
