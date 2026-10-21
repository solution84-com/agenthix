// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { MessageItem, PersonBubble } from '../MessageItem'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
function msg(over: Record<string, unknown>): ConversationMessageView {
  return {
    id: 'm1', seq: 1, clientMessageId: null, role: 'AGENT', authorId: null, agentId: 'a1', kind: 'TEXT',
    body: { text: 'Hello' }, spoken: false, interrupted: false, operationId: null, turnId: 't1', queueState: null,
    createdAt: '2026-10-16T10:24:00.000Z', ...over,
  } as ConversationMessageView
}

describe('a message in the thread @SC-1004', () => {
  it('draws the agent\'s text under its name', () => {
    render(<MessageItem message={msg({})} agent={agent} />)
    expect(screen.getByText('Kernel')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('draws a person\'s text as a bubble of theirs', () => {
    render(<MessageItem message={msg({ role: 'PERSON', agentId: null })} agent={agent} />)
    expect(screen.getByTestId('person-message').textContent).toContain('Hello')
  })

  it('draws a failed reply as a card with its reason, after what was written of it', () => {
    render(<MessageItem message={msg({ kind: 'FAILED', body: { reason: 'The model said it is busy. Try again in a minute.', partialText: 'Let me che' } })} agent={agent} />)
    expect(screen.getByText('Let me che')).toBeTruthy()
    expect(screen.getByTestId('failed-card').textContent).toContain('The model said it is busy. Try again in a minute.')
  })

  it('draws a notice as a quiet line', () => {
    render(<MessageItem message={msg({ role: 'PLATFORM', kind: 'NOTICE', body: { text: 'Now using your own key' } })} agent={agent} />)
    expect(screen.getByText('Now using your own key')).toBeTruthy()
    expect(screen.queryByText('Kernel')).toBeNull()
  })
})

describe('a message waiting behind a reply @SC-1008', () => {
  const waiting = msg({ role: 'PERSON', agentId: null, queueState: 'WAITING' }) as Extract<ConversationMessageView, { kind: 'TEXT' }>

  it('says so and offers Send now and Cancel', () => {
    const sendNow = vi.fn()
    const cancel = vi.fn()
    render(<PersonBubble message={waiting} waiting onSendNow={sendNow} onCancel={cancel} />)
    expect(screen.getByText('Waits for the reply to finish')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(sendNow).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('offers nothing on a message that is not waiting', () => {
    render(<PersonBubble message={waiting} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
