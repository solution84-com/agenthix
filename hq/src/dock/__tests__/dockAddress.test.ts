import { describe, expect, it } from 'vitest'
import { conversationsSectionOf, threadAddressOf, withConversation } from '../dockAddress'

describe('the addresses the dock reads and writes @SC-1026 @SC-1027', () => {
  it('reads a conversation’s own address, in your space or a project', () => {
    expect(threadAddressOf('/chat/t/c1')).toEqual({ basePath: '/chat', conversationId: 'c1' })
    expect(threadAddressOf('/projects/AGX/t/c2')).toEqual({ basePath: '/projects/AGX', conversationId: 'c2' })
    expect(threadAddressOf('/chat')).toBeNull()
    expect(threadAddressOf('/tasks/AGX-1')).toBeNull()
    expect(threadAddressOf('/projects/AGX/t/c2/more')).toBeNull()
  })

  it('sets and takes off `c`, keeping the rest of the address', () => {
    expect(withConversation({ pathname: '/projects/AGX', search: '?tool=tasks' }, 'c1')).toBe('/projects/AGX?tool=tasks&c=c1')
    expect(withConversation({ pathname: '/', search: '?c=old', hash: '#top' }, 'c1')).toBe('/?c=c1#top')
    expect(withConversation({ pathname: '/tasks', search: '?c=c1&view=list' }, null)).toBe('/tasks?view=list')
    expect(withConversation({ pathname: '/tasks', search: '?c=c1' }, null)).toBe('/tasks')
  })

  it('shows a place’s Conversations section: the Chat page for your space, the section for a project', () => {
    expect(conversationsSectionOf('/chat')).toEqual({ pathname: '/chat', search: '' })
    expect(conversationsSectionOf('/projects/AGX')).toEqual({ pathname: '/projects/AGX', search: '?tool=conversations' })
  })
})
