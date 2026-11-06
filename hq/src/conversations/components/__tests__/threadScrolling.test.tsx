// @vitest-environment jsdom
/** Reading a long thread (area 2b, improvements 9 and 10): where a new answer opens, the round ↓ and its dot, the start mark. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'
import { followTarget } from '../threadScroll'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const answer = (seq: number): ConversationMessageView => ({
  id: `m${seq}`, seq, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: `Answer ${seq}` },
  spoken: false, interrupted: false, operationId: null, turnId: `t${seq}`, queueState: null, createdAt: '2026-10-16T11:15:00.000Z',
} as ConversationMessageView)

function Thread({ messages, hasMore = false }: { messages: ConversationMessageView[]; hasMore?: boolean }) {
  return (
    <ThreadMessages
      messages={messages} waiting={[]} stream={null} running={false} agent={agent} hasMore={hasMore} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}}
    />
  )
}

/** Gives the scroller a height, a viewport and a position, as the browser would, then lets it hear the scroll. */
function scrollTo(box: HTMLElement, top: number) {
  Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 500 })
  box.scrollTop = top
  act(() => { fireEvent.scroll(box) })
}

describe('where a new answer opens @SC-1005', () => {
  it('follows to the bottom when the answer fits the view', () => {
    expect(followTarget({ scrollHeight: 2000, clientHeight: 500 }, 1800)).toBe(1500)
  })

  it('opens at its start when the answer is taller than the view, with a little room above', () => {
    expect(followTarget({ scrollHeight: 2000, clientHeight: 500 }, 900)).toBe(892)
  })

  it('follows to the bottom when there is no answer to open at', () => {
    expect(followTarget({ scrollHeight: 2000, clientHeight: 500 }, null)).toBe(1500)
  })
})

describe('the round ↓ above the box @SC-1005', () => {
  it('is not there while the newest is in view', () => {
    render(<Thread messages={[answer(1)]} />)
    scrollTo(screen.getByTestId('thread-messages'), 1500)
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })

  it('shows while scrolled up, with no dot, and jumps to the latest', () => {
    render(<Thread messages={[answer(1)]} />)
    const box = screen.getByTestId('thread-messages')
    scrollTo(box, 200)
    const jump = screen.getByRole('button', { name: 'Jump to the latest' })
    expect(screen.queryByTestId('jump-dot')).toBeNull()
    fireEvent.click(jump)
    expect(box.scrollTop).toBe(1500)
  })

  it('shows a dot once a new answer has arrived while scrolled up, and drops it on reaching the latest', () => {
    const { rerender } = render(<Thread messages={[answer(1)]} />)
    const box = screen.getByTestId('thread-messages')
    scrollTo(box, 200)
    rerender(<Thread messages={[answer(1), answer(2)]} />)
    expect(screen.getByTestId('jump-dot')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Jump to the latest, a new answer has arrived' })).toBeTruthy()
    scrollTo(box, 1500)
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })

  it('shows no dot for an answer that arrived while the newest was in view', () => {
    const { rerender } = render(<Thread messages={[answer(1)]} />)
    const box = screen.getByTestId('thread-messages')
    scrollTo(box, 1500)
    rerender(<Thread messages={[answer(1), answer(2)]} />)
    scrollTo(box, 200)
    expect(screen.queryByTestId('jump-dot')).toBeNull()
  })
})

describe('the start of the conversation @SC-1005', () => {
  it('is marked once nothing earlier is left to load', () => {
    render(<Thread messages={[answer(1)]} />)
    expect(screen.getByTestId('conversation-start').textContent).toBe('Start of the conversation')
  })

  it('is not marked while earlier messages wait', () => {
    render(<Thread messages={[answer(5)]} hasMore />)
    expect(screen.queryByTestId('conversation-start')).toBeNull()
  })
})
