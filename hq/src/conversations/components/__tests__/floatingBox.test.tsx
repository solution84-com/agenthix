// @vitest-environment jsdom
/** The chat's message box floats over the thread (the owner's finding 17): the thread keeps room at its end, and the round ↓ rides above the box. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import { endSpaceFor, ROOM_GAP } from '../../hooks/useFloatingRoom'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const answer: ConversationMessageView = {
  id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: 'Answer' },
  spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null, createdAt: '2026-10-16T11:15:00.000Z',
} as ConversationMessageView

const thread = (floatingHeight?: number) => (
  <ThreadMessages
    messages={[answer]} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
    onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} floatingHeight={floatingHeight}
  />
)

describe('the thread under the floating box', () => {
  it('keeps the box’s height and a gap at its end, so the last line scrolls clear of the box', () => {
    expect(endSpaceFor(120)).toBe(120 + ROOM_GAP)
    render(thread(120))
    expect(screen.getByTestId('thread-end-space').style.paddingBottom).toBe(`${120 + ROOM_GAP}px`)
  })

  it('keeps its ordinary padding with no box over it', () => {
    render(thread())
    expect(screen.getByTestId('thread-end-space').style.paddingBottom).toBe('')
  })

  it('lifts the round ↓ above the box', () => {
    render(thread(120))
    const box = screen.getByTestId('thread-messages')
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 500 })
    box.scrollTop = 0
    act(() => { fireEvent.scroll(box) })
    expect(screen.getByTestId('jump-to-latest').style.bottom).toBe('132px')
  })
})

import { ConversationHeader } from '../ConversationHeader'

describe('the conversation’s header', () => {
  it('is one bar: avatar, then name over title, then the places and ⋯, with a hairline the panel’s full width under it, not inside the bar', () => {
    render(<ConversationHeader title="A very long title" avatar={<i data-testid="av" />} name="Kernel" places={<b data-testid="pl" />} tools={<u data-testid="tl" />} />)
    const bar = screen.getByTestId('conversation-header')
    const order = [...bar.querySelectorAll('[data-testid="av"],[data-testid="conversation-header-name"],[data-testid="conversation-header-title"],[data-testid="pl"],[data-testid="tl"]')].map((e) => e.getAttribute('data-testid'))
    expect(order).toEqual(['av', 'conversation-header-name', 'conversation-header-title', 'pl', 'tl'])
    expect(screen.getByTestId('conversation-header-name').className).toContain('font-medium')
    expect(screen.getByTestId('conversation-header-name').className).toContain('text-text-primary')
    expect(screen.getByTestId('conversation-header-title').className).toContain('text-text-secondary')
    expect(screen.getByTestId('conversation-header-title').getAttribute('title')).toBe('A very long title')
    expect(bar.className).not.toMatch(/border-b/)
    expect(bar.parentElement?.className ?? '').toMatch(/border-b/)
  })
})
