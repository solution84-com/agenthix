// @vitest-environment jsdom
/** The thread going to its end when asked by its owner: the demo's scripted call as it starts (ADR-0186). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { ThreadMessages } from '../ThreadMessages'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Writer', handle: 'writer', avatarUrl: null }
const answer: ConversationMessageView = {
  id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT', body: { text: 'A long results card' },
  spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null, createdAt: '2026-11-11T11:15:00.000Z',
} as ConversationMessageView

function Thread({ toEnd }: { toEnd?: boolean }) {
  return (
    <ThreadMessages
      messages={[answer]} waiting={[]} stream={null} running={false} agent={agent} hasMore={false} loadingOlder={false}
      onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} floatingHeight={240} toEnd={toEnd}
    />
  )
}

const scrollUp = () => act(() => { fireEvent.wheel(screen.getByTestId('thread-messages'), { deltaY: -40 }) })

describe('the thread goes to its end as the demo call starts (usability finding 7) @SC-1961', () => {
  it('follows the end again, so no round ↓ sits over the last card', () => {
    const { rerender } = render(<Thread />)
    scrollUp()
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
    rerender(<Thread toEnd />)
    expect(screen.queryByTestId('jump-to-latest')).toBeNull()
  })

  it('moves nothing while not asked: outside the demo the prop is never set', () => {
    const { rerender } = render(<Thread />)
    scrollUp()
    rerender(<Thread toEnd={false} />)
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
  })

  it('asks once: scrolling up during the call lets go again', () => {
    const { rerender } = render(<Thread toEnd />)
    scrollUp()
    rerender(<Thread toEnd />)
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()
  })
})
